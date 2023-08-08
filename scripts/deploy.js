const hre = require("hardhat");

async function main() {

    const DELAY = 12*60*60;
    const ADMIN = '0x0000000000000000000000000000000000000001';

    const VaultFactory = await ethers.getContractFactory("VaultImplementation");
    const vault = await VaultFactory.deploy();
    await vault.deployed();
    console.log("VaultImplementation: ", vault.address);

    const VaultsFactoryFactory = await ethers.getContractFactory("ValtsFactory.sol");
    const factory = await VaultsFactoryFactory.deploy(vault.address, DELAY, ADMIN);
    await factory.deployed();
    console.log("NFTShop: ", factory.address);

    await new Promise(r => setTimeout(r, 100000)); // time to index new contracts

    await hre.run("verify:verify", {
        address: vault.address,
        constructorArguments: [],
    });

    await hre.run("verify:verify", {
        address: factory.address,
        constructorArguments: [vault.address, DELAY, ADMIN],
    });

}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
