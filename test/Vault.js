const {ethers} = require("hardhat");
const {expect} = require("chai");

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

const BN = ethers.BigNumber.from;
const ETH = (x) => ethers.utils.parseEther(x.toString())

describe("Vault", function () {
    let vaultsFactory, weth;
    let deployer, adminRole, pauseRole, teamRole, feeReceiver, nobody, addr1, addr2;

    let token1, token2, token3;
    let vault1, vault2, vault3, wethVault;

    let VaultsFactoryFactory;

    let PAUSE_ROLE, TEAM_ROLE, ADMIN_ROLE;

    beforeEach(async function () {
        [deployer, adminRole, pauseRole, teamRole, feeReceiver, nobody, addr1, addr2] = await ethers.getSigners();

        const WethFactory = await ethers.getContractFactory("MockWeth");
        const TokenFactory = await ethers.getContractFactory("MockERC20");
        VaultsFactoryFactory = await ethers.getContractFactory("VaultsFactory");

        weth = await WethFactory.deploy();
        await weth.deployed();

        token1 = await TokenFactory.deploy("Mock Token1", "MTK1", 0, ETH("1000"));
        await token1.deployed();
        token2 = await TokenFactory.deploy("Mock Token2", "MTK2", 18, ETH("1000"));
        await token2.deployed();
        token3 = await TokenFactory.deploy("Mock Token3", "MTK3", 33, ETH("1000"));
        await token3.deployed();

        vaultsFactory = await VaultsFactoryFactory.deploy(weth.address, 3600, adminRole.address, ZERO_ADDRESS, 0);
        await vaultsFactory.deployed();

        PAUSE_ROLE = await vaultsFactory.PAUSE_ROLE();
        TEAM_ROLE = await vaultsFactory.TEAM_ROLE();
        ADMIN_ROLE = await vaultsFactory.DEFAULT_ADMIN_ROLE();

        // Setting roles for pauseRole, teamRole
        await vaultsFactory.connect(adminRole).grantRole(PAUSE_ROLE, pauseRole.address);
        await vaultsFactory.connect(adminRole).grantRole(TEAM_ROLE, teamRole.address);

        let tx = await vaultsFactory.connect(teamRole).deployVault(token1.address, "", "");
        const vault1addr = (await tx.wait()).events[0].args.vaultAddress;
        vault1 = await ethers.getContractAt('Vault', vault1addr)

        tx = await vaultsFactory.connect(teamRole).deployVault(token1.address, "", "");
        const vault2addr = (await tx.wait()).events[0].args.vaultAddress;
        vault2 = await ethers.getContractAt('Vault', vault2addr)

        tx = await vaultsFactory.connect(teamRole).deployVault(token1.address, "", "");
        const vault3addr = (await tx.wait()).events[0].args.vaultAddress;
        vault3 = await ethers.getContractAt('Vault', vault3addr)

        tx = await vaultsFactory.connect(teamRole).deployVault(weth.address, "", "");
        const wethVaultAddr = (await tx.wait()).events[0].args.vaultAddress;
        wethVault = await ethers.getContractAt('Vault', wethVaultAddr)
    });

    it("simple deploys and check params", async function () {
        expect(await vault1.name()).to.equal('Vaulted MTK1')
        expect(await vault1.symbol()).to.equal('vMTK1')
        expect(await vault1.decimals()).to.equal(0)
        expect(await vault1.isEth()).to.equal(false)
        expect(await vault1.factory()).to.equal(vaultsFactory.address)
        expect(await vault1.underlyingToken()).to.equal(token1.address)

        let tx = await vaultsFactory.connect(teamRole).deployVault(weth.address, "name", "symbol");
        const vaultAddr = (await tx.wait()).events[0].args.vaultAddress;
        const vault = await ethers.getContractAt('Vault', vaultAddr)

        expect(await vault.name()).to.equal('name')
        expect(await vault.symbol()).to.equal('symbol')
        expect(await vault.decimals()).to.equal(18)
        expect(await vault.isEth()).to.equal(true)
        expect(await vault.factory()).to.equal(vaultsFactory.address)
        expect(await vault.underlyingToken()).to.equal(weth.address)
    });

    it("ether methods for non ether", async function () {
        await expect(vault1.wrapEther()).to.be.revertedWith("VAULTS: NOT_ETHER");

        await expect(nobody.sendTransaction({to: vault1.address, value: 1})).to.be.revertedWith("VAULTS: NOT_ETHER");
        await expect(nobody.sendTransaction({to: wethVault.address, value: 1})).to.be.revertedWith("VAULTS: RESTRICTED");
    });


    it("simple wrap and unwrap", async function () {
        expect(await token1.balanceOf(deployer.address)).to.equal(ETH(1000))
        expect(await token1.balanceOf(vault1.address)).to.equal(0)
        expect(await vault1.balanceOf(deployer.address)).to.equal(0)
        expect(await vault1.totalSupply()).to.equal(0)

        await token1.approve(vault1.address, ETH(1));
        await vault1.wrap(ETH(1))

        expect(await token1.balanceOf(deployer.address)).to.equal(ETH(999))
        expect(await token1.balanceOf(vault1.address)).to.equal(ETH(1))
        expect(await vault1.balanceOf(deployer.address)).to.equal(ETH(1))
        expect(await vault1.totalSupply()).to.equal(ETH(1))

        await expect(vault1.unwrap(ETH(1).add(1))).to.be.revertedWith("VAULTS: INSUFFICIENT_BALANCE");
        await expect(vault1.unwrap(0)).to.be.revertedWith("VAULTS: INVALID_AMOUNT");
        await expect(vault1.claim()).to.be.revertedWith("VAULTS: NO_UNWRAP_REQUESTED");
        await expect(vault1.cancelUnwrap()).to.be.revertedWith("VAULTS: NO_UNWRAP_TO_CANCEL");
        await vault1.unwrap(ETH(1))

        expect(await token1.balanceOf(deployer.address)).to.equal(ETH(999))
        expect(await token1.balanceOf(vault1.address)).to.equal(ETH(1))
        expect(await vault1.balanceOf(deployer.address)).to.equal(ETH(1))
        expect(await vault1.totalSupply()).to.equal(ETH(1))

        await expect(vault1.claim()).to.be.revertedWith("VAULTS: UNWRAP_DELAY_NOT_MET");

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")

        await vault1.claim()

        expect(await token1.balanceOf(deployer.address)).to.equal(ETH(1000))
        expect(await token1.balanceOf(vault1.address)).to.equal(0)
        expect(await vault1.balanceOf(deployer.address)).to.equal(0)
        expect(await vault1.totalSupply()).to.equal(0)

    });

    it("simple wrap and unwrap for ether", async function () {
        const initialBalance = await ethers.provider.getBalance(deployer.address);

        expect(await ethers.provider.getBalance(wethVault.address)).to.equal(0)
        expect(await ethers.provider.getBalance(weth.address)).to.equal(0)
        expect(await wethVault.balanceOf(deployer.address)).to.equal(0)
        expect(await wethVault.totalSupply()).to.equal(0)

        await wethVault.wrapEther({value: ETH(1)})

        expect(await ethers.provider.getBalance(deployer.address)).to.closeTo(initialBalance.sub(ETH(1)), ETH('0.001'))
        expect(await weth.balanceOf(wethVault.address)).to.equal(ETH(1))
        expect(await ethers.provider.getBalance(wethVault.address)).to.equal(0)
        expect(await ethers.provider.getBalance(weth.address)).to.equal(ETH(1))
        expect(await wethVault.balanceOf(deployer.address)).to.equal(ETH(1))
        expect(await wethVault.totalSupply()).to.equal(ETH(1))

        await wethVault.unwrap(ETH(1))

        expect(await ethers.provider.getBalance(deployer.address)).to.closeTo(initialBalance.sub(ETH(1)), ETH('0.001'))
        expect(await weth.balanceOf(wethVault.address)).to.equal(ETH(1))
        expect(await ethers.provider.getBalance(wethVault.address)).to.equal(0)
        expect(await ethers.provider.getBalance(weth.address)).to.equal(ETH(1))
        expect(await wethVault.balanceOf(deployer.address)).to.equal(ETH(1))
        expect(await wethVault.totalSupply()).to.equal(ETH(1))

        await expect(wethVault.claim()).to.be.revertedWith("VAULTS: UNWRAP_DELAY_NOT_MET");

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine");

        await wethVault.claim();

        expect(await ethers.provider.getBalance(deployer.address)).to.closeTo(initialBalance, ETH('0.001'))
        expect(await weth.balanceOf(wethVault.address)).to.equal(0)
        expect(await ethers.provider.getBalance(wethVault.address)).to.equal(0)
        expect(await ethers.provider.getBalance(weth.address)).to.equal(0)
        expect(await wethVault.balanceOf(deployer.address)).to.equal(0)
        expect(await wethVault.totalSupply()).to.equal(0)

    });

    it("simple wrap and unwrap for weth", async function () {
        const initialBalance = await ethers.provider.getBalance(deployer.address);
        await deployer.sendTransaction({to: weth.address, value: ETH(1)})

        expect(await ethers.provider.getBalance(wethVault.address)).to.equal(0)
        expect(await ethers.provider.getBalance(weth.address)).to.equal(ETH(1))
        expect(await weth.balanceOf(deployer.address)).to.equal(ETH(1))
        expect(await weth.balanceOf(wethVault.address)).to.equal(0)
        expect(await wethVault.balanceOf(deployer.address)).to.equal(0)
        expect(await wethVault.totalSupply()).to.equal(0)

        await weth.approve(wethVault.address, ETH(1));
        await wethVault.wrap(ETH(1))

        expect(await ethers.provider.getBalance(deployer.address)).to.closeTo(initialBalance.sub(ETH(1)), ETH('0.001'))
        expect(await ethers.provider.getBalance(wethVault.address)).to.equal(0)
        expect(await ethers.provider.getBalance(weth.address)).to.equal(ETH(1))
        expect(await weth.balanceOf(deployer.address)).to.equal(0)
        expect(await weth.balanceOf(wethVault.address)).to.equal(ETH(1))
        expect(await wethVault.balanceOf(deployer.address)).to.equal(ETH(1))
        expect(await wethVault.totalSupply()).to.equal(ETH(1))

        await wethVault.unwrap(ETH(1))

        expect(await ethers.provider.getBalance(deployer.address)).to.closeTo(initialBalance.sub(ETH(1)), ETH('0.001'))
        expect(await ethers.provider.getBalance(wethVault.address)).to.equal(0)
        expect(await ethers.provider.getBalance(weth.address)).to.equal(ETH(1))
        expect(await weth.balanceOf(deployer.address)).to.equal(0)
        expect(await weth.balanceOf(wethVault.address)).to.equal(ETH(1))
        expect(await wethVault.balanceOf(deployer.address)).to.equal(ETH(1))
        expect(await wethVault.totalSupply()).to.equal(ETH(1))

        await expect(wethVault.claim()).to.be.revertedWith("VAULTS: UNWRAP_DELAY_NOT_MET");

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine");

        await wethVault.claim();

        expect(await ethers.provider.getBalance(deployer.address)).to.closeTo(initialBalance, ETH('0.001'))
        expect(await ethers.provider.getBalance(wethVault.address)).to.equal(0)
        expect(await ethers.provider.getBalance(weth.address)).to.equal(0)
        expect(await weth.balanceOf(deployer.address)).to.equal(0)
        expect(await weth.balanceOf(wethVault.address)).to.equal(0)
        expect(await wethVault.balanceOf(deployer.address)).to.equal(0)
        expect(await wethVault.totalSupply()).to.equal(0)
    });

    it("wrap zero", async function () {
        await token1.approve(vault1.address, ETH(1));
        await expect(vault1.wrap(0)).to.be.revertedWith("VAULTS: INVALID_AMOUNT");

        await expect(wethVault.wrapEther({value: 0})).to.be.revertedWith("VAULTS: INVALID_AMOUNT");
    });

    it("cancel unwrap 1", async function () {
        await token1.approve(vault1.address, ETH(1));
        await vault1.wrap(ETH(1))

        await vault1.unwrap(ETH(1))

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")

        await vault1.cancelUnwrap()

        await expect(vault1.claim()).to.be.revertedWith("VAULTS: NO_UNWRAP_REQUESTED");
    });

    it("cancel unwrap 2", async function () {
        await token1.approve(vault1.address, ETH(1));
        await vault1.wrap(ETH(1))

        await vault1.unwrap(ETH(1))

        await vault1.cancelUnwrap()

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")

        await expect(vault1.claim()).to.be.revertedWith("VAULTS: NO_UNWRAP_REQUESTED");
    });

    it("transfer of requested unwrap is prohibited", async function () {
        await token1.approve(vault1.address, ETH(1));
        await vault1.wrap(ETH(1))

        await vault1.unwrap(1)

        await expect(vault1.transfer(nobody.address, ETH(1))).to.be.revertedWith("VAULTS: TRANSFER_EXCEEDS_BALANCE");


        await vault1.cancelUnwrap()
        await vault1.transfer(nobody.address, ETH(1))
        expect (await vault1.balanceOf(nobody.address)).to.equal(ETH(1))
    });
    it("transferFrom of requested unwrap is prohibited", async function () {
        await token1.approve(vault1.address, ETH(1));
        await vault1.wrap(ETH(1))

        await vault1.unwrap(1)

        await vault1.approve(addr1.address, ETH(1))
        await expect(vault1.connect(addr1).transferFrom(deployer.address, nobody.address, ETH(1))).to.be.revertedWith("VAULTS: TRANSFER_EXCEEDS_BALANCE");

        await vault1.cancelUnwrap()
        await vault1.connect(addr1).transferFrom(deployer.address, nobody.address, ETH(1))
        expect (await vault1.balanceOf(nobody.address)).to.equal(ETH(1))
    });

    it("transfer of requested unwrap is prohibited after delay", async function () {
        await token1.approve(vault1.address, ETH(1));
        await vault1.wrap(ETH(1))

        await vault1.unwrap(1)

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")

        await expect(vault1.transfer(nobody.address, ETH(1))).to.be.revertedWith("VAULTS: TRANSFER_EXCEEDS_BALANCE");


        await vault1.cancelUnwrap()
        await vault1.transfer(nobody.address, ETH(1))
        expect (await vault1.balanceOf(nobody.address)).to.equal(ETH(1))
    });
    it("transferFrom of requested unwrap is prohibited after delay", async function () {
        await token1.approve(vault1.address, ETH(1));
        await vault1.wrap(ETH(1))

        await vault1.unwrap(1)

        await network.provider.send("evm_increaseTime", [3600])
        await network.provider.send("evm_mine")

        await vault1.approve(addr1.address, ETH(1))
        await expect(vault1.connect(addr1).transferFrom(deployer.address, nobody.address, ETH(1))).to.be.revertedWith("VAULTS: TRANSFER_EXCEEDS_BALANCE");

        await vault1.cancelUnwrap()
        await vault1.connect(addr1).transferFrom(deployer.address, nobody.address, ETH(1))
        expect (await vault1.balanceOf(nobody.address)).to.equal(ETH(1))
    });


    it("partial transfer of requested unwrap is allowed", async function () {
        await token1.approve(vault1.address, ETH(1));
        await vault1.wrap(ETH(1))

        await vault1.unwrap(1)

        await vault1.transfer(nobody.address, ETH(1).sub(1));
        await expect(vault1.transfer(nobody.address, 1)).to.be.revertedWith("VAULTS: TRANSFER_EXCEEDS_BALANCE");

        expect (await vault1.balanceOf(deployer.address)).to.equal(1)
        expect (await vault1.balanceOf(nobody.address)).to.equal(ETH(1).sub(1))

        await vault1.cancelUnwrap()
        await vault1.transfer(nobody.address, 1)
        expect (await vault1.balanceOf(nobody.address)).to.equal(ETH(1))
    });
    it("partial transferFrom of requested unwrap is allowed", async function () {
        await token1.approve(vault1.address, ETH(1));
        await vault1.wrap(ETH(1))

        await vault1.unwrap(1)

        await vault1.approve(addr1.address, ETH(1))
        await vault1.connect(addr1).transferFrom(deployer.address, nobody.address, ETH(1).sub(1))
        await expect(vault1.connect(addr1).transferFrom(deployer.address, nobody.address, 1)).to.be.revertedWith("VAULTS: TRANSFER_EXCEEDS_BALANCE");

        expect (await vault1.balanceOf(deployer.address)).to.equal(1)
        expect (await vault1.balanceOf(nobody.address)).to.equal(ETH(1).sub(1))

        await vault1.cancelUnwrap()
        await vault1.connect(addr1).transferFrom(deployer.address, nobody.address, 1)
        expect (await vault1.balanceOf(nobody.address)).to.equal(ETH(1))
    });

    it("wrap with fee", async function () {
        await vaultsFactory.connect(adminRole).setFeeBasisPoints(100);

        await token1.approve(vault1.address, ETH(1));
        await expect(vault1.wrap(ETH(1))).to.be.revertedWith("VAULTS: FEE_RECEIVER_NOT_SET");

        await vaultsFactory.connect(adminRole).setFeeReceiver(nobody.address);

        await vault1.wrap(ETH(1))
        expect(await token1.balanceOf(vault1.address)).to.equal(ETH('0.99'))
        expect(await token1.balanceOf(nobody.address)).to.equal(ETH('0.01'))
        expect(await vault1.balanceOf(deployer.address)).to.equal(ETH('0.99'))
        expect(await vault1.totalSupply()).to.equal(ETH('0.99'))
    });

    it("wrap ether with fee", async function () {
        await vaultsFactory.connect(adminRole).setFeeBasisPoints(100);

        await expect(wethVault.wrapEther({value:ETH(1)})).to.be.revertedWith("VAULTS: FEE_RECEIVER_NOT_SET");

        await vaultsFactory.connect(adminRole).setFeeReceiver(nobody.address);

        await wethVault.wrapEther({value:ETH(1)})
        expect(await weth.balanceOf(wethVault.address)).to.equal(ETH('0.99'))
        expect(await weth.balanceOf(nobody.address)).to.equal(ETH('0.01'))
        expect(await wethVault.balanceOf(deployer.address)).to.equal(ETH('0.99'))
        expect(await wethVault.totalSupply()).to.equal(ETH('0.99'))
    });

    it("paused operations", async function () {
        await token1.approve(vault1.address, ETH(1));

        await vaultsFactory.connect(adminRole).pauseAllVaults()

        await expect(vault1.wrap(ETH(1))).to.be.revertedWith("VAULTS: OPERATION_PAUSED");
        await expect(wethVault.wrapEther({value:ETH(1)})).to.be.revertedWith("VAULTS: OPERATION_PAUSED");

        await vaultsFactory.connect(adminRole).unpauseAllVaults()

        await vault1.wrap(ETH(1))
        await wethVault.wrapEther({value:ETH(1)})

        await vaultsFactory.connect(adminRole).pauseAllVaults()

        await expect(vault1.unwrap(ETH(1))).to.be.revertedWith("VAULTS: OPERATION_PAUSED");
        await expect(wethVault.unwrap(ETH(1))).to.be.revertedWith("VAULTS: OPERATION_PAUSED");
        await expect(vault1.claim()).to.be.revertedWith("VAULTS: OPERATION_PAUSED");
        await expect(wethVault.claim()).to.be.revertedWith("VAULTS: OPERATION_PAUSED");
        await expect(vault1.cancelUnwrap()).to.be.revertedWith("VAULTS: OPERATION_PAUSED");
        await expect(wethVault.cancelUnwrap()).to.be.revertedWith("VAULTS: OPERATION_PAUSED");

    });

    it("emergency withdrawal", async function () {
        await vaultsFactory.connect(adminRole).grantRole(ADMIN_ROLE, addr1.address);

        await token1.approve(vault1.address, ETH(1));
        await vault1.wrap(ETH(1))

        await expect(vault1.connect(adminRole).emergencyWithdraw(ETH(1))).to.be.revertedWith("VAULTS: NOT_PAUSED");
        await expect(vault1.connect(addr1).emergencyWithdraw(ETH(1))).to.be.revertedWith("VAULTS: NOT_PAUSED");
        await expect(vault1.connect(nobody).emergencyWithdraw(ETH(1))).to.be.revertedWith("VAULTS: NOT_PAUSED");
        await expect(vaultsFactory.connect(nobody).emergencyWithdrawFromVault(vault1.address, ETH(1))).to.be.revertedWith("AccessControl: account " + nobody.address.toLowerCase() + " is missing role " + ADMIN_ROLE);
        await expect(vaultsFactory.connect(pauseRole).emergencyWithdrawFromVault(vault1.address, ETH(1))).to.be.revertedWith("AccessControl: account " + pauseRole.address.toLowerCase() + " is missing role " + ADMIN_ROLE);
        await expect(vaultsFactory.connect(teamRole).emergencyWithdrawFromVault(vault1.address, ETH(1))).to.be.revertedWith("AccessControl: account " + teamRole.address.toLowerCase() + " is missing role " + ADMIN_ROLE);
        await expect(vaultsFactory.connect(adminRole).emergencyWithdrawFromVault(vault1.address, ETH(1))).to.be.revertedWith("VAULTS: NOT_PAUSED");


        await vaultsFactory.connect(adminRole).pauseAllVaults()

        await expect(vault1.connect(adminRole).emergencyWithdraw(ETH(1))).to.be.revertedWith("VAULTS: NOT_FACTORY_ADDRESS");
        await expect(vault1.connect(addr1).emergencyWithdraw(ETH(1))).to.be.revertedWith("VAULTS: NOT_FACTORY_ADDRESS");
        await expect(vault1.connect(nobody).emergencyWithdraw(ETH(1))).to.be.revertedWith("VAULTS: NOT_FACTORY_ADDRESS");
        await expect(vaultsFactory.connect(nobody).emergencyWithdrawFromVault(vault1.address, ETH(1))).to.be.revertedWith("AccessControl: account " + nobody.address.toLowerCase() + " is missing role " + ADMIN_ROLE);
        await expect(vaultsFactory.connect(pauseRole).emergencyWithdrawFromVault(vault1.address, ETH(1))).to.be.revertedWith("AccessControl: account " + pauseRole.address.toLowerCase() + " is missing role " + ADMIN_ROLE);
        await expect(vaultsFactory.connect(teamRole).emergencyWithdrawFromVault(vault1.address, ETH(1))).to.be.revertedWith("AccessControl: account " + teamRole.address.toLowerCase() + " is missing role " + ADMIN_ROLE);

        expect(await token1.balanceOf(adminRole.address)).to.equal(0);

        await vaultsFactory.connect(adminRole).emergencyWithdrawFromVault(vault1.address, ETH('0.3'));
        expect(await token1.balanceOf(adminRole.address)).to.equal(ETH('0.3'));

        await vaultsFactory.connect(addr1).emergencyWithdrawFromVault(vault1.address, 0);
        expect(await token1.balanceOf(adminRole.address)).to.equal(ETH('1'));

        await vaultsFactory.connect(adminRole).unpauseAllVaults()

        await token1.approve(vault1.address, ETH(1));
        await expect(vault1.wrap(ETH(1))).to.be.revertedWith("VAULTS: OPERATION_PAUSED_EMERGENCY");
        await expect(vault1.claim()).to.be.revertedWith("VAULTS: OPERATION_PAUSED_EMERGENCY");
        await expect(vault1.unwrap(ETH(1))).to.be.revertedWith("VAULTS: OPERATION_PAUSED_EMERGENCY");
        await expect(vault1.cancelUnwrap()).to.be.revertedWith("VAULTS: OPERATION_PAUSED_EMERGENCY");
    });

    it("emergency withdrawal on admin change", async function () {
        await vaultsFactory.connect(adminRole).grantRole(ADMIN_ROLE, addr1.address);

        await token1.approve(vault1.address, ETH(1));
        await vault1.wrap(ETH(1))

        await vaultsFactory.connect(adminRole).pauseAllVaults()

        expect(await token1.balanceOf(adminRole.address)).to.equal(0);
        expect(await token1.balanceOf(addr1.address)).to.equal(0);

        await vaultsFactory.connect(adminRole).emergencyWithdrawFromVault(vault1.address, ETH('0.3'));
        expect(await token1.balanceOf(adminRole.address)).to.equal(ETH('0.3'));
        expect(await token1.balanceOf(addr1.address)).to.equal(0);

        await vaultsFactory.connect(addr1).revokeRole(ADMIN_ROLE, adminRole.address);

        await vaultsFactory.connect(addr1).emergencyWithdrawFromVault(vault1.address, 0);
        expect(await token1.balanceOf(adminRole.address)).to.equal(ETH('0.3'));
        expect(await token1.balanceOf(addr1.address)).to.equal(ETH('0.7'));
    });

    it("simple permit check", async function () {
        await token1.approve(vault1.address, ETH(1));
        await vault1.wrap(ETH(1))
        const deadline = BN((await ethers.provider.getBlock()).timestamp + 60);
        const chainId = (await ethers.provider.getNetwork()).chainId;

        expect(await vault1.balanceOf(deployer.address)).to.equal(ETH(1))

        await expect(vault1.connect(addr1).transferFrom(deployer.address, nobody.address, 333)).to.be.revertedWith("ERC20: insufficient allowance");
        await expect(vault1.connect(addr2).transferFrom(deployer.address, nobody.address, 333)).to.be.revertedWith("ERC20: insufficient allowance");


        let signature = await getSignature("Vaulted MTK2", chainId, vault1.address, deployer, addr1.address, BN(333), BN(0), deadline);
        await expect( vault1.connect(nobody).permit(deployer.address, addr1.address, BN(333), deadline, signature[0], signature[1], signature[2])).to.be.revertedWith("ERC20Permit: invalid signature");

        signature = await getSignature("Vaulted MTK1", 3, vault1.address, deployer, addr1.address, BN(333), BN(0), deadline);
        await expect( vault1.connect(nobody).permit(deployer.address, addr1.address, BN(333), deadline, signature[0], signature[1], signature[2])).to.be.revertedWith("ERC20Permit: invalid signature");

        signature = await getSignature("Vaulted MTK1", chainId, vault2.address, deployer, addr1.address, BN(333), BN(0), deadline);
        await expect( vault1.connect(nobody).permit(deployer.address, addr1.address, BN(333), deadline, signature[0], signature[1], signature[2])).to.be.revertedWith("ERC20Permit: invalid signature");

        signature = await getSignature("Vaulted MTK1", chainId, vault1.address, addr2, addr1.address, BN(333), BN(0), deadline);
        await expect( vault1.connect(nobody).permit(deployer.address, addr1.address, BN(333), deadline, signature[0], signature[1], signature[2])).to.be.revertedWith("ERC20Permit: invalid signature");

        signature = await getSignature("Vaulted MTK1", chainId, vault1.address, deployer, addr2.address, BN(333), BN(0), deadline);
        await expect( vault1.connect(nobody).permit(deployer.address, addr1.address, BN(333), deadline, signature[0], signature[1], signature[2])).to.be.revertedWith("ERC20Permit: invalid signature");

        signature = await getSignature("Vaulted MTK1", chainId, vault1.address, deployer, addr1.address, BN(333), BN(1), deadline);
        await expect( vault1.connect(nobody).permit(deployer.address, addr1.address, BN(333), deadline, signature[0], signature[1], signature[2])).to.be.revertedWith("ERC20Permit: invalid signature");

        signature = await getSignature("Vaulted MTK1", chainId, vault1.address, deployer, addr1.address, BN(333), BN(0), 0);
        await expect( vault1.connect(nobody).permit(deployer.address, addr1.address, BN(333), deadline, signature[0], signature[1], signature[2])).to.be.revertedWith("ERC20Permit: invalid signature");


        await expect(vault1.connect(addr1).transferFrom(deployer.address, nobody.address, 333)).to.be.revertedWith("ERC20: insufficient allowance");
        await expect(vault1.connect(addr2).transferFrom(deployer.address, nobody.address, 333)).to.be.revertedWith("ERC20: insufficient allowance");


        signature = await getSignature("Vaulted MTK1", chainId, vault1.address, deployer, addr1.address, BN(333), BN(0), deadline);
        await vault1.connect(nobody).permit(deployer.address, addr1.address, BN(333), deadline, signature[0], signature[1], signature[2])

        await expect(vault1.connect(addr1).transferFrom(deployer.address, nobody.address, 334)).to.be.revertedWith("ERC20: insufficient allowance");
        await expect(vault1.connect(addr2).transferFrom(deployer.address, nobody.address, 334)).to.be.revertedWith("ERC20: insufficient allowance");

        await expect(vault1.connect(addr2).transferFrom(deployer.address, nobody.address, 333)).to.be.revertedWith("ERC20: insufficient allowance");
        await vault1.connect(addr1).transferFrom(deployer.address, nobody.address, 333)
    });
});

async function getSignature(tokenName, chainId, verifyingContract, signer, to, amount, nonce, deadline) {
    const domain = {
        name: tokenName,
        version: '1',
        chainId,
        verifyingContract
    };
    const types = {
        Permit: [
            {name: 'owner', type: 'address'},
            {name: 'spender', type: 'address'},
            {name: 'value', type: 'uint256'},
            {name: 'nonce', type: 'uint256'},
            {name: 'deadline', type: 'uint256'},
        ]
    };
    const message = {
        owner: signer.address,
        spender: to,
        value: amount,
        nonce: nonce,
        deadline: deadline
    };
    const sig = await signer._signTypedData(domain, types, message);
    return getVRS(sig);
}

function getVRS(sig) {
    let _sig = sig.slice(2);
    let v = parseInt(`0x${_sig.slice(128, 130)}`);
    return [
        v,
        `0x${_sig.slice(0, 64)}`,
        `0x${_sig.slice(64, 128)}`
    ]
}