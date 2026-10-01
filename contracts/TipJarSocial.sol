// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * TipJar Social — 链上推特
 *
 * 设计原则：
 *  1. 帖子内容只走事件（event），不写 storage。事件永久保存在链上、可通过
 *     eth_getLogs 读取，但比 SSTORE 便宜 10 倍以上。这是"发一条帖子 $0.001"的关键。
 *  2. 只把「最小必要」的状态写进 storage：帖子计数、作者映射、父帖引用。
 *     这些是别的合约/前端需要直接查询的，值得付 SSTORE 的钱。
 *  3. 打赏零托管：USDC 直接转发给作者，本合约不持有任何资金。
 *  4. 不限制帖子长度：让 gas 自己决定成本（Arc 区块 30M gas 是物理上限）。
 *
 * Arc 特性注意：
 *  - USDC 是 Arc 的原生资产（18 位精度），不是 ERC-20 包装。
 *    因此打赏用 msg.value + call{value:}，而不是 ERC-20 transfer。
 *    （ERC-20 接口 0x3600...0000 是同一个余额的另一种视图，6 位精度。）
 *  - gas 用 USDC 支付；mempool 有 20 gwei 硬下限，低于此值交易被静默丢弃。
 */
contract TipJarSocial {
    // ---------------------------------------------------------------- 状态

    /// @notice 帖子总数，同时用作下一个帖子的 id
    uint256 public postCount;

    /// @notice 帖子 id => 作者地址（打赏必需，值得付 SSTORE）
    mapping(uint256 => address) public postAuthor;

    // 注意：帖子时间戳和父帖 id **不写 storage**——事件里已经有了
    // （Post 事件带 parent 和 timestamp），索引器从事件重建即可。
    // 省下 40k gas/帖，把发帖成本从 $0.0022 压到 $0.0014。

    struct Author {
        string github; // GitHub 用户名
        string x;      // X / Twitter 用户名
        string site;   // 个人网站
        bool   bound;  // 是否绑定过任意身份
    }

    /// @notice 钱包地址 => 已声明的身份
    mapping(address => Author) public authors;

    /// @notice 钱包地址 => 用户名（3-20 位，小写字母/数字/下划线）
    mapping(address => string) public usernameOf;

    /// @notice keccak256(用户名) => 持有者地址。这是唯一性的唯一依据：
    ///         只要这个映射里已有别人，就不能再取这个名字。
    mapping(bytes32 => address) public ownerOfName;

    // ---------------------------------------------------------------- 事件

    /// @notice 一条帖子（内容只在事件里，不写 storage）
    event Post(
        uint256 indexed id,
        address indexed author,
        uint256 indexed parent, // 0 = 顶层帖
        string  content,
        uint64  timestamp
    );

    /// @notice 身份绑定声明
    event IdentityBound(address indexed wallet, string platform, string username);

    /// @notice 用户名设置/变更（oldName 为空表示首次设置）
    event UsernameSet(address indexed wallet, string username);

    /// @notice 打赏记录
    event Tipped(
        uint256 indexed postId,   // 0 表示直接打赏作者、不针对帖子
        address indexed from,
        address indexed to,
        uint256 amount,           // 18 位（原生 USDC）
        string  note
    );

    // ---------------------------------------------------------------- 发帖

    /**
     * @notice 发一条顶层帖
     * @param content 帖子正文（UTF-8，不限长度；gas 随长度线性增长）
     * @return id 新帖子的 id
     */
    function post(string calldata content) external returns (uint256 id) {
        id = _create(msg.sender, 0, content);
    }

    /**
     * @notice 回复某条帖子
     * @param parent 父帖 id（必须已存在）
     * @param content 回复正文
     * @return id 新帖子的 id
     */
    function reply(uint256 parent, string calldata content) external returns (uint256 id) {
        require(parent < postCount, "parent not found");
        id = _create(msg.sender, parent, content);
    }

    function _create(address author, uint256 parent, string calldata content) private returns (uint256 id) {
        id = postCount++;
        postAuthor[id] = author; // 唯一的 storage 写：打赏时要用
        emit Post(id, author, parent, content, uint64(block.timestamp));
    }

    // ---------------------------------------------------------------- 身份

    /**
     * @notice 声明一个身份（github / x / site）。
     *
     * 注意：这里只做「链上声明」，不做所有权证明。真正的验证在链下：
     *  - GitHub / X 走 OAuth，确认这个用户名确实属于当前用户；
     *  - 校验通过后前端才允许提交这笔绑定交易。
     * 之所以不做链上证明，是因为 GitHub/X 无法对任意消息签名，没有可信的链上验证路径。
     *
     * @param platform "github" | "x" | "site"
     * @param username 用户名（site 传完整 URL）
     */
    function bind(string calldata platform, string calldata username) external {
        bytes32 p = keccak256(bytes(platform));
        Author storage a = authors[msg.sender];

        if (p == keccak256("github")) {
            a.github = username;
        } else if (p == keccak256("x")) {
            a.x = username;
        } else if (p == keccak256("site")) {
            a.site = username;
        } else {
            revert("unknown platform");
        }

        a.bound = true;
        emit IdentityBound(msg.sender, platform, username);
    }

    // ---------------------------------------------------------------- 用户名

    /**
     * @notice 设置用户名。全局唯一，先到先得，且**每个钱包只能设置一次**。
     *
     * 一次性是刻意的：用户名是身份，不是昵称。允许反复改会让
     * 「@someone」指向一个不断变化的人，也让抢注有意义的名字变成
     * 零成本的游戏。设错了就换钱包——这条规则写死在合约里，没有后门。
     *
     * 唯一性由 ownerOfName 映射保证：如果这个名字已被别人占用，交易 revert。
     *
     * 命名规则：3-20 个字符，只允许小写字母 a-z、数字 0-9、下划线 _。
     * 强制小写是为了避免 Alice / alice / ALICE 被当成三个不同的名字，
     * 从而绕过唯一性检查。
     *
     * @param name 新用户名（必须已经是小写）
     */
    function setUsername(string calldata name) external {
        require(bytes(usernameOf[msg.sender]).length == 0, "username already set");

        bytes memory b = bytes(name);
        uint256 len = b.length;
        require(len >= 3 && len <= 20, "length must be 3-20");

        for (uint256 i = 0; i < len; i++) {
            bytes1 c = b[i];
            bool ok = (c >= 0x61 && c <= 0x7a) // a-z
                   || (c >= 0x30 && c <= 0x39) // 0-9
                   || (c == 0x5f);             // _
            require(ok, "only a-z 0-9 _");
        }

        bytes32 key = keccak256(b);
        require(ownerOfName[key] == address(0), "username taken");

        usernameOf[msg.sender] = name;
        ownerOfName[key] = msg.sender;

        emit UsernameSet(msg.sender, name);
    }

    /// @notice 查询某个用户名是否已被占用（前端可以先查再发交易，省 gas）
    function isNameTaken(string calldata name) external view returns (bool) {
        address holder = ownerOfName[keccak256(bytes(name))];
        return holder != address(0);
    }

    // ---------------------------------------------------------------- 打赏

    /**
     * @notice 打赏某条帖子的作者。钱直接转给作者，本合约不留存。
     * @param postId 帖子 id
     * @param note   附言（可为空）
     */
    function tipPost(uint256 postId, string calldata note) external payable {
        require(postId < postCount, "post not found");
        require(msg.value > 0, "zero tip");
        address to = postAuthor[postId];
        _pay(postId, to, note);
    }

    /**
     * @notice 直接打赏一个地址（不针对帖子）。
     * @param to   收款地址
     * @param note 附言
     */
    function tipAuthor(address to, string calldata note) external payable {
        require(to != address(0), "bad recipient");
        require(msg.value > 0, "zero tip");
        _pay(0, to, note);
    }

    function _pay(uint256 postId, address to, string calldata note) private {
        (bool ok, ) = payable(to).call{value: msg.value}("");
        require(ok, "transfer failed");
        emit Tipped(postId, msg.sender, to, msg.value, note);
    }

    // ---------------------------------------------------------------- 只读

    /// @notice 批量查询帖子作者，减少前端 RPC 往返
    function getAuthors(uint256[] calldata ids) external view returns (address[] memory out) {
        out = new address[](ids.length);
        for (uint256 i = 0; i < ids.length; i++) {
            out[i] = postAuthor[ids[i]];
        }
    }
}
