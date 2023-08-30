const {ethers} = require("hardhat");
const {expect} = require("chai");

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';
const ETH = ethers.utils.parseEther

describe("VaultsFactory", function () {
    let vaultsFactory, weth;
    let deployer, adminRole, pauseRole, teamRole, feeReceiver, nobody, addr1, addr2;

    let token1, token2, token3;

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
    });

    it("constructor initializes state correctly", async function () {

        const newVaultsFactory = await VaultsFactoryFactory.deploy(weth.address,3600, adminRole.address, ZERO_ADDRESS, 0);
        await newVaultsFactory.deployed();

        expect(await newVaultsFactory.weth()).to.equal(weth.address);
        expect(await newVaultsFactory.unwrapDelay()).to.equal(3600);

        expect(await newVaultsFactory.hasRole(ADMIN_ROLE, adminRole.address)).to.equal(true);
        expect(await newVaultsFactory.getRoleMember(ADMIN_ROLE, 0)).to.equal(adminRole.address);
        expect(await newVaultsFactory.getRoleMemberCount(ADMIN_ROLE)).to.equal(1);

        expect(await newVaultsFactory.hasRole(PAUSE_ROLE, adminRole.address)).to.equal(true);
        expect(await newVaultsFactory.getRoleMember(PAUSE_ROLE, 0)).to.equal(adminRole.address);
        expect(await newVaultsFactory.getRoleMemberCount(PAUSE_ROLE)).to.equal(1);

        expect(await newVaultsFactory.hasRole(TEAM_ROLE, adminRole.address)).to.equal(true);
        expect(await newVaultsFactory.getRoleMember(TEAM_ROLE, 0)).to.equal(adminRole.address);
        expect(await newVaultsFactory.getRoleMemberCount(TEAM_ROLE)).to.equal(1);

        expect(await newVaultsFactory.feeReceiver()).to.equal(ZERO_ADDRESS);
        expect(await newVaultsFactory.feeBasisPoints()).to.equal(0);
    });


    it("constructor negative", async function () {
        await expect(VaultsFactoryFactory.deploy(ZERO_ADDRESS, 3600, adminRole.address, ZERO_ADDRESS, 0))
            .to.be.revertedWith("VAULTS: ZERO_ADDRESS");
    });

    it("constructor initializes state with non-zero fee receiver and fee correctly", async function () {
        const fee = 5;  // assuming this is in basis points, which means 0.05%

        const newVaultsFactory = await VaultsFactoryFactory.deploy(weth.address, 3600, adminRole.address, feeReceiver.address, fee);
        await newVaultsFactory.deployed();

        // Check basic properties
        expect(await newVaultsFactory.weth()).to.equal(weth.address);
        expect(await newVaultsFactory.unwrapDelay()).to.equal(3600);

        // Check admin roles
        expect(await newVaultsFactory.hasRole(newVaultsFactory.DEFAULT_ADMIN_ROLE(), adminRole.address)).to.equal(true);
        expect(await newVaultsFactory.getRoleMember(newVaultsFactory.DEFAULT_ADMIN_ROLE(), 0)).to.equal(adminRole.address);
        expect(await newVaultsFactory.getRoleMemberCount(newVaultsFactory.DEFAULT_ADMIN_ROLE())).to.equal(1);

        // Check fee settings
        expect(await newVaultsFactory.feeReceiver()).to.equal(feeReceiver.address);
        expect(await newVaultsFactory.feeBasisPoints()).to.equal(fee);
    });

    it("smoke roles checks", async function () {
        const newVaultsFactory = await VaultsFactoryFactory.deploy(weth.address, 3600, adminRole.address, ZERO_ADDRESS, 0);
        await newVaultsFactory.deployed();

        // ADMIN_ROLE is admin for pause role
        expect(await vaultsFactory.getRoleAdmin(PAUSE_ROLE)).to.equal(ADMIN_ROLE);
        await expect(vaultsFactory.connect(pauseRole).grantRole(PAUSE_ROLE, nobody.address)).to.be.revertedWith("AccessControl: account " + pauseRole.address.toLowerCase() + " is missing role " + ADMIN_ROLE);
        await expect(vaultsFactory.connect(teamRole).grantRole(PAUSE_ROLE, nobody.address)).to.be.revertedWith("AccessControl: account " + teamRole.address.toLowerCase() + " is missing role " + ADMIN_ROLE);
        await expect(vaultsFactory.connect(nobody).grantRole(PAUSE_ROLE, nobody.address)).to.be.revertedWith("AccessControl: account " + nobody.address.toLowerCase() + " is missing role " + ADMIN_ROLE);

        // ADMIN_ROLE is admin for deploy role
        expect(await vaultsFactory.getRoleAdmin(TEAM_ROLE)).to.equal(ADMIN_ROLE);
        await expect(vaultsFactory.connect(pauseRole).grantRole(TEAM_ROLE, nobody.address)).to.be.revertedWith("AccessControl: account " + pauseRole.address.toLowerCase() + " is missing role " + ADMIN_ROLE);
        await expect(vaultsFactory.connect(teamRole).grantRole(TEAM_ROLE, nobody.address)).to.be.revertedWith("AccessControl: account " + teamRole.address.toLowerCase() + " is missing role " + ADMIN_ROLE);
        await expect(vaultsFactory.connect(nobody).grantRole(TEAM_ROLE, nobody.address)).to.be.revertedWith("AccessControl: account " + nobody.address.toLowerCase() + " is missing role " + ADMIN_ROLE);

        // ADMIN_ROLE is admin for admin role
        expect(await vaultsFactory.getRoleAdmin(ADMIN_ROLE)).to.equal(ADMIN_ROLE);
        await expect(vaultsFactory.connect(pauseRole).grantRole(ADMIN_ROLE, nobody.address)).to.be.revertedWith("AccessControl: account " + pauseRole.address.toLowerCase() + " is missing role " + ADMIN_ROLE);
        await expect(vaultsFactory.connect(teamRole).grantRole(ADMIN_ROLE, nobody.address)).to.be.revertedWith("AccessControl: account " + teamRole.address.toLowerCase() + " is missing role " + ADMIN_ROLE);
        await expect(vaultsFactory.connect(nobody).grantRole(ADMIN_ROLE, nobody.address)).to.be.revertedWith("AccessControl: account " + nobody.address.toLowerCase() + " is missing role " + ADMIN_ROLE);

        await vaultsFactory.connect(adminRole).grantRole(PAUSE_ROLE, pauseRole.address);
        await vaultsFactory.connect(adminRole).grantRole(TEAM_ROLE, teamRole.address);

        // ADMIN_ROLE is admin for pause role
        expect(await vaultsFactory.getRoleAdmin(PAUSE_ROLE)).to.equal(ADMIN_ROLE);
        await expect(vaultsFactory.connect(pauseRole).grantRole(PAUSE_ROLE, nobody.address)).to.be.revertedWith("AccessControl: account " + pauseRole.address.toLowerCase() + " is missing role " + ADMIN_ROLE);
        await expect(vaultsFactory.connect(teamRole).grantRole(PAUSE_ROLE, nobody.address)).to.be.revertedWith("AccessControl: account " + teamRole.address.toLowerCase() + " is missing role " + ADMIN_ROLE);
        await expect(vaultsFactory.connect(nobody).grantRole(PAUSE_ROLE, nobody.address)).to.be.revertedWith("AccessControl: account " + nobody.address.toLowerCase() + " is missing role " + ADMIN_ROLE);

        // ADMIN_ROLE is admin for deploy role
        expect(await vaultsFactory.getRoleAdmin(TEAM_ROLE)).to.equal(ADMIN_ROLE);
        await expect(vaultsFactory.connect(pauseRole).grantRole(TEAM_ROLE, nobody.address)).to.be.revertedWith("AccessControl: account " + pauseRole.address.toLowerCase() + " is missing role " + ADMIN_ROLE);
        await expect(vaultsFactory.connect(teamRole).grantRole(TEAM_ROLE, nobody.address)).to.be.revertedWith("AccessControl: account " + teamRole.address.toLowerCase() + " is missing role " + ADMIN_ROLE);
        await expect(vaultsFactory.connect(nobody).grantRole(TEAM_ROLE, nobody.address)).to.be.revertedWith("AccessControl: account " + nobody.address.toLowerCase() + " is missing role " + ADMIN_ROLE);

        // ADMIN_ROLE is admin for admin role
        expect(await vaultsFactory.getRoleAdmin(ADMIN_ROLE)).to.equal(ADMIN_ROLE);
        await expect(vaultsFactory.connect(pauseRole).grantRole(ADMIN_ROLE, nobody.address)).to.be.revertedWith("AccessControl: account " + pauseRole.address.toLowerCase() + " is missing role " + ADMIN_ROLE);
        await expect(vaultsFactory.connect(teamRole).grantRole(ADMIN_ROLE, nobody.address)).to.be.revertedWith("AccessControl: account " + teamRole.address.toLowerCase() + " is missing role " + ADMIN_ROLE);
        await expect(vaultsFactory.connect(nobody).grantRole(ADMIN_ROLE, nobody.address)).to.be.revertedWith("AccessControl: account " + nobody.address.toLowerCase() + " is missing role " + ADMIN_ROLE);
    });

    describe("Vaults Pausing and Unpausing", function () {

        let vault1, vault2, vault3;

        beforeEach(async function() {
            let tx = await vaultsFactory.connect(teamRole).deployVault(token1.address, "VaultToken1", "VTK1");
            vault1 = (await tx.wait()).events[0].args.vaultAddress
            tx = await vaultsFactory.connect(teamRole).deployVault(token2.address, "VaultToken2", "VTK2");
            vault2 = (await tx.wait()).events[0].args.vaultAddress
            tx = await vaultsFactory.connect(teamRole).deployVault(token3.address, "VaultToken2", "VTK2");
            vault3 = (await tx.wait()).events[0].args.vaultAddress
        });

        it("pause", async function() {
            expect(await vaultsFactory.isPaused(vault1)).to.be.false;
            expect(await vaultsFactory.isPaused(vault2)).to.be.false;
            expect(await vaultsFactory.isPaused(vault3)).to.be.false;

            await expect(vaultsFactory.connect(pauseRole).pauseVault(vault1))
                .to.emit(vaultsFactory, "VaultPaused")
                .withArgs(vault1);

            expect(await vaultsFactory.isPaused(vault1)).to.be.true;
            expect(await vaultsFactory.isPaused(vault2)).to.be.false;
            expect(await vaultsFactory.isPaused(vault3)).to.be.false;


            // teamRole, and others shouldn't be able to pause the vault
            await expect(vaultsFactory.connect(teamRole).pauseVault(vault3)).to.be.revertedWith("AccessControl: account " + teamRole.address.toLowerCase() + " is missing role " + PAUSE_ROLE);
            await expect(vaultsFactory.connect(nobody).pauseVault(vault3)).to.be.revertedWith("AccessControl: account " + nobody.address.toLowerCase() + " is missing role " + PAUSE_ROLE);

            // non vault
            await expect(vaultsFactory.connect(pauseRole).pauseVault(token1.address)).to.be.revertedWith("VAULTS: NOT_VAULT");
            await expect(vaultsFactory.connect(pauseRole).pauseVault(nobody.address)).to.be.revertedWith("VAULTS: NOT_VAULT");
        });

        it("unpause", async function () {
            await vaultsFactory.connect(pauseRole).pauseVault(vault1);
            await vaultsFactory.connect(pauseRole).pauseVault(vault2);
            expect(await vaultsFactory.isPaused(vault1)).to.be.true;
            expect(await vaultsFactory.isPaused(vault2)).to.be.true;

            // pauseRole, teamRole, and others shouldn't be able to unpause the vault
            await expect(vaultsFactory.connect(pauseRole).unpauseVault(vault1)).to.be.revertedWith("AccessControl: account " + pauseRole.address.toLowerCase() + " is missing role " + ADMIN_ROLE);
            await expect(vaultsFactory.connect(teamRole).unpauseVault(vault1)).to.be.revertedWith("AccessControl: account " + teamRole.address.toLowerCase() + " is missing role " + ADMIN_ROLE);
            await expect(vaultsFactory.connect(nobody).unpauseVault(vault1)).to.be.revertedWith("AccessControl: account " + nobody.address.toLowerCase() + " is missing role " + ADMIN_ROLE);

            // adminRole should be able to unpause the vault
            await expect(vaultsFactory.connect(adminRole).unpauseVault(vault1))
                .to.emit(vaultsFactory, "VaultUnpaused")
                .withArgs(vault1);

            expect(await vaultsFactory.isPaused(vault1)).to.be.false;
            expect(await vaultsFactory.isPaused(vault2)).to.be.true;

            // adminRole should be able to unpause the vault
            await expect(vaultsFactory.connect(adminRole).unpauseVault(vault1))
                .to.emit(vaultsFactory, "VaultUnpaused")
                .withArgs(vault1);

            // non vault
            await expect(vaultsFactory.connect(adminRole).unpauseVault(token1.address)).to.be.revertedWith("VAULTS: NOT_VAULT");
            await expect(vaultsFactory.connect(adminRole).unpauseVault(nobody.address)).to.be.revertedWith("VAULTS: NOT_VAULT");
        });

        it("pause/unpause all", async function () {

            expect(await vaultsFactory.isPaused(vault1)).to.be.false;
            expect(await vaultsFactory.isPaused(vault2)).to.be.false;

            await expect(vaultsFactory.connect(pauseRole).pauseAllVaults())
                .to.emit(vaultsFactory, "AllVaultsPaused");

            expect(await vaultsFactory.allVaultsPaused()).to.be.true;

            expect(await vaultsFactory.isPaused(vault1)).to.be.true;
            expect(await vaultsFactory.isPaused(vault2)).to.be.true;

            // pauseRole, teamRole, and others shouldn't be able to unpause all vaults
            await expect(vaultsFactory.connect(pauseRole).unpauseAllVaults()).to.be.revertedWith("AccessControl: account " + pauseRole.address.toLowerCase() + " is missing role " + ADMIN_ROLE);
            await expect(vaultsFactory.connect(teamRole).unpauseAllVaults()).to.be.revertedWith("AccessControl: account " + teamRole.address.toLowerCase() + " is missing role " + ADMIN_ROLE);
            await expect(vaultsFactory.connect(nobody).unpauseAllVaults()).to.be.revertedWith("AccessControl: account " + nobody.address.toLowerCase() + " is missing role " + ADMIN_ROLE);

            // adminRole should be able to unpause all vaults
            await expect(vaultsFactory.connect(adminRole).unpauseAllVaults())
                .to.emit(vaultsFactory, "AllVaultsUnpaused");

            expect(await vaultsFactory.isPaused(vault1)).to.be.false;
            expect(await vaultsFactory.isPaused(vault2)).to.be.false;

            // teamRole, and others shouldn't be able to pause all vaults
            await expect(vaultsFactory.connect(teamRole).pauseAllVaults()).to.be.revertedWith("AccessControl: account " + teamRole.address.toLowerCase() + " is missing role " + PAUSE_ROLE);
            await expect(vaultsFactory.connect(nobody).pauseAllVaults()).to.be.revertedWith("AccessControl: account " + nobody.address.toLowerCase() + " is missing role " + PAUSE_ROLE);

            expect(await vaultsFactory.isPaused(vault1)).to.be.false;
            expect(await vaultsFactory.isPaused(vault2)).to.be.false;
        });

    });

    it("unwrap delay", async function () {

        expect(await vaultsFactory.unwrapDelay()).to.equal(3600);

        await expect(vaultsFactory.connect(pauseRole).setUnwrapDelay(3)).to.be.revertedWith("AccessControl: account " + pauseRole.address.toLowerCase() + " is missing role " + ADMIN_ROLE);
        await expect(vaultsFactory.connect(teamRole).setUnwrapDelay(3)).to.be.revertedWith("AccessControl: account " + teamRole.address.toLowerCase() + " is missing role " + ADMIN_ROLE);
        await expect(vaultsFactory.connect(nobody).setUnwrapDelay(3)).to.be.revertedWith("AccessControl: account " + nobody.address.toLowerCase() + " is missing role " + ADMIN_ROLE);

        expect(await vaultsFactory.unwrapDelay()).to.equal(3600);

        await vaultsFactory.connect(adminRole).setUnwrapDelay(3);
        expect(await vaultsFactory.unwrapDelay()).to.equal(3);
    });

    it("fee receiver", async function () {

        expect(await vaultsFactory.feeReceiver()).to.equal(ZERO_ADDRESS);

        await expect(vaultsFactory.connect(pauseRole).setFeeReceiver(nobody.address)).to.be.revertedWith("AccessControl: account " + pauseRole.address.toLowerCase() + " is missing role " + TEAM_ROLE);
        await expect(vaultsFactory.connect(nobody).setFeeReceiver(nobody.address)).to.be.revertedWith("AccessControl: account " + nobody.address.toLowerCase() + " is missing role " + TEAM_ROLE);

        expect(await vaultsFactory.feeReceiver()).to.equal(ZERO_ADDRESS);

        await vaultsFactory.connect(teamRole).setFeeReceiver(nobody.address);
        expect(await vaultsFactory.feeReceiver()).to.equal(nobody.address);
    });

    it("fee percent", async function () {

        expect(await vaultsFactory.feeBasisPoints()).to.equal(0);

        await expect(vaultsFactory.connect(pauseRole).setFeeBasisPoints(3)).to.be.revertedWith("AccessControl: account " + pauseRole.address.toLowerCase() + " is missing role " + TEAM_ROLE);
        await expect(vaultsFactory.connect(nobody).setFeeBasisPoints(3)).to.be.revertedWith("AccessControl: account " + nobody.address.toLowerCase() + " is missing role " + TEAM_ROLE);

        await expect(vaultsFactory.connect(adminRole).setFeeBasisPoints(201)).to.be.revertedWith("VAULTS: EXCESSIVE_FEE_PERCENT");

        expect(await vaultsFactory.feeBasisPoints()).to.equal(0);

        await vaultsFactory.connect(teamRole).setFeeBasisPoints(3);
        expect(await vaultsFactory.feeBasisPoints()).to.equal(3);
    });

    it("deploy", async function () {
        await expect(vaultsFactory.connect(pauseRole).deployVault(token1.address, "", "")).to.be.revertedWith("AccessControl: account " + pauseRole.address.toLowerCase() + " is missing role " + TEAM_ROLE);
        await expect(vaultsFactory.connect(nobody).deployVault(token1.address, "", "")).to.be.revertedWith("AccessControl: account " + nobody.address.toLowerCase() + " is missing role " + TEAM_ROLE);

        await expect(vaultsFactory.connect(teamRole).deployVault(token1.address, "", ""))
            .to.emit(vaultsFactory, "VaultDeployed");
    });

});
