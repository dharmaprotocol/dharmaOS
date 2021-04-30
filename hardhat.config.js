require('dotenv').config();
require("@nomiclabs/hardhat-ethers");

const url = process.env.WEB3_PROVIDER_URL;

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: {
    version: "0.8.4",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      }
    }
  },
  networks: {
    hardhat: {
      forking: {
        url,
      }
    }
  },
  mocha: {
    timeout: 99999,
    parallel: true,
  }
};
