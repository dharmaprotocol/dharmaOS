require('dotenv').config();
require("@nomiclabs/hardhat-ethers");

const providersRaw = process.env.WEB3_PROVIDER_URLS_BY_CHAINID;

if (!providersRaw) {
  throw new Error('supply "WEB3_PROVIDER_URLS_BY_CHAINID" as a stringified JSON object');
}

let providers;
try {
  providers = JSON.parse(providersRaw);
} catch (e) {
  throw new Error(`Cannot parse "WEB3_PROVIDER_URLS_BY_CHAINID": ${e.message}`);
}

if (!(typeof providers === 'object' && !Array.isArray(providers))) {
  throw new Error('"WEB3_PROVIDER_URLS_BY_CHAINID" must be formatted as {chainId: url, ...}');
}

if (Object.keys(providers).length === 0) {
  throw new Error('No providers found in "WEB3_PROVIDER_URLS_BY_CHAINID"');
}

if (typeof providers[1] !== 'string') {
  throw new Error('No provider found for mainnet (chainId = 1) in "WEB3_PROVIDER_URLS_BY_CHAINID"');
}

const directNetworks = Object.entries(providers)
  .map(([chainId, url]) => [
    chainId,
    {
      url,
    }
  ]).reduce(
    (result, [key, value]) => Object.assign({}, result, {[key]: value}),
    {}
  );

const networks = {
  ...directNetworks,
  hardhat: {
    forking: {
      url: providers[1],
    },
  },
};

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
  networks,
  mocha: {
    timeout: 99999,
    parallel: true,
  }
};
