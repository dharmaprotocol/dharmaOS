require('dotenv').config();
require("@nomiclabs/hardhat-ethers");

const url = process.env.WEB3_PROVIDER_URL;

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: "0.8.1",
  networks: {
    hardhat: {
      forking: {
        url,
      }
    }
  },
  mocha: {
    timeout: 99999,
    parallel: true
  }
};
