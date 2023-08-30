const hre = require("hardhat");

async function main() {

    const DELAY = 12*60*60;
    const ADMIN = '0x0000000000000000000000000000000000000001';
    const WETH = '0x0000000000000000000000000000000000000002';
    const FEE_RECEIVER = '0x0000000000000000000000000000000000000000';
    const FEE = 0;

    const VaultsFactoryFactory = await ethers.getContractFactory("VaultsFactory");
    const factory = await VaultsFactoryFactory.deploy(WETH, DELAY, ADMIN, FEE_RECEIVER, FEE);
    await factory.deployed();
    console.log("Factory: ", factory.address);

    await new Promise(r => setTimeout(r, 100000)); // time to index new contracts

    await hre.run("verify:verify", {
        address: factory.address,
        constructorArguments: [WETH, DELAY, ADMIN, FEE_RECEIVER, FEE],
    });
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
