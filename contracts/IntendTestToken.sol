// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title IntendTestToken
 * @notice Sandbox test token for Intend — Autonomous Financial Concierge
 * @dev Deployed on Ethereum Sepolia and Arbitrum Sepolia for testnet demo.
 *      iUSDT maps 1:1 to real USDT. iXAUT maps 1:1 to Tether Gold (XAUT).
 *      Minter is the Intend faucet — auto-credits new users on signup.
 */
contract IntendTestToken {
    string public name;
    string public symbol;
    uint8 public decimals;
    uint256 public totalSupply;

    address public minter;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    event Mint(address indexed to, uint256 amount);

    modifier onlyMinter() {
        require(msg.sender == minter, "IntendTestToken: caller is not minter");
        _;
    }

    constructor(string memory _name, string memory _symbol, uint8 _decimals) {
        name = _name;
        symbol = _symbol;
        decimals = _decimals;
        minter = msg.sender;
    }

    /**
     * @notice Mint tokens to any address — called by Intend faucet on user signup
     * @dev 100,000 iUSDT and 100,000 iXAUT credited per user per chain
     */
    function mint(address to, uint256 amount) public onlyMinter {
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
        emit Mint(to, amount);
    }

    function transfer(address to, uint256 amount) public returns (bool) {
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        emit Transfer(msg.sender, to, amount);
        return true;
    }

    function approve(address spender, uint256 amount) public returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) public returns (bool) {
        require(balanceOf[from] >= amount, "Insufficient balance");
        require(allowance[from][msg.sender] >= amount, "Insufficient allowance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }
}
