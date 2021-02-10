const hre = require("hardhat");
const ethers = hre.ethers;
const axios = require("axios");
const { Validator } = require('./Validator');
const { Encoder } = require("./Encoder");
const { ResultsParser } = require("./results-parser");

const ERC20_ABI = [
    {
        constant: true,
        inputs: [],
        name: "name",
        outputs: [
            {
                name: "",
                type: "string",
            },
        ],
        payable: false,
        stateMutability: "view",
        type: "function",
    },
    {
        constant: false,
        inputs: [
            {
                name: "_spender",
                type: "address",
            },
            {
                name: "_value",
                type: "uint256",
            },
        ],
        name: "approve",
        outputs: [
            {
                name: "",
                type: "bool",
            },
        ],
        payable: false,
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        constant: true,
        inputs: [],
        name: "totalSupply",
        outputs: [
            {
                name: "",
                type: "uint256",
            },
        ],
        payable: false,
        stateMutability: "view",
        type: "function",
    },
    {
        constant: false,
        inputs: [
            {
                name: "_from",
                type: "address",
            },
            {
                name: "_to",
                type: "address",
            },
            {
                name: "_value",
                type: "uint256",
            },
        ],
        name: "transferFrom",
        outputs: [
            {
                name: "",
                type: "bool",
            },
        ],
        payable: false,
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        constant: true,
        inputs: [],
        name: "decimals",
        outputs: [
            {
                name: "",
                type: "uint8",
            },
        ],
        payable: false,
        stateMutability: "view",
        type: "function",
    },
    {
        constant: true,
        inputs: [
            {
                name: "_owner",
                type: "address",
            },
        ],
        name: "balanceOf",
        outputs: [
            {
                name: "balance",
                type: "uint256",
            },
        ],
        payable: false,
        stateMutability: "view",
        type: "function",
    },
    {
        constant: true,
        inputs: [],
        name: "symbol",
        outputs: [
            {
                name: "",
                type: "string",
            },
        ],
        payable: false,
        stateMutability: "view",
        type: "function",
    },
    {
        constant: false,
        inputs: [
            {
                name: "_to",
                type: "address",
            },
            {
                name: "_value",
                type: "uint256",
            },
        ],
        name: "transfer",
        outputs: [
            {
                name: "",
                type: "bool",
            },
        ],
        payable: false,
        stateMutability: "nonpayable",
        type: "function",
    },
    {
        constant: true,
        inputs: [
            {
                name: "_owner",
                type: "address",
            },
            {
                name: "_spender",
                type: "address",
            },
        ],
        name: "allowance",
        outputs: [
            {
                name: "",
                type: "uint256",
            },
        ],
        payable: false,
        stateMutability: "view",
        type: "function",
    },
    {
        payable: true,
        stateMutability: "payable",
        type: "fallback",
    },
    {
        anonymous: false,
        inputs: [
            {
                indexed: true,
                name: "owner",
                type: "address",
            },
            {
                indexed: true,
                name: "spender",
                type: "address",
            },
            {
                indexed: false,
                name: "value",
                type: "uint256",
            },
        ],
        name: "Approval",
        type: "event",
    },
    {
        anonymous: false,
        inputs: [
            {
                indexed: true,
                name: "from",
                type: "address",
            },
            {
                indexed: true,
                name: "to",
                type: "address",
            },
            {
                indexed: false,
                name: "value",
                type: "uint256",
            },
        ],
        name: "Transfer",
        type: "event",
    },
];

const getRandomArbitrary = (min, max) => (Math.random() * (max - min) + min);

const longer = () => (
  new Promise(
    resolve => {setTimeout(() => {resolve()}, getRandomArbitrary(700, 5000))}
  )
);

const get = async (url, params = {}, retries = 0) => {
  try {
    const response = await axios.get(url, params);
    const data = response.data;
    if (data.status === '0' && typeof data.result === 'string') {
      throw new Error(`BAD REQUEST: ${data}`);
    }
    return data;
  } catch (error) {
    if (retries > 3) {
      console.log('MAX RETRIES EXCEEDED')
      console.error(error);
      process.exit(1);
    }
    await longer();
    return await get(url, params, retries + 1);
  }
}

const getABI = async (account) => {
  // TODO: first see if a file with account name is in `contractABIs` directory
  const data = await get(
    'https://api.etherscan.io/api',
    {
      params: {
        module: 'contract',
        action: 'getabi',
        address: account,
        apikey: process.env.ETHERSCAN_API_KEY,
      }
    }
  );

  if (data && data.status === '1' && data.message === 'OK' && data.result) {
  	// TODO: write ABI to file with account name in `contractABIs` directory
  	return data.result;
  } else {
  	throw new Error(`bad Etherscan response: ${data}`);
  }
}

async function main() {
	const signers = await ethers.getSigners();
	const signer = signers[0];

	const Wallet = await ethers.getContractFactory("Wallet");
	const wallet = await Wallet.deploy(signer.address);

	const actionScript = await Validator.getActionScript("SWAP_ON_CURVE");
	const { definitions, inputs } = actionScript;

	const VARIABLES = {
		soldTokenAmount: "1000000000000000000",
		soldTokenAddress: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
		boughtTokenAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
		curvePoolAddress: "0xbEbc44782C7dB0a1A60Cb6fe97d0b483032FF1C7",
		soldTokenIndex: 0,
		boughtTokenIndex: 1,
		minimumBoughtTokenAmount: "900000",
	};

	const tokenDefinitions = Object.fromEntries(
		definitions
			.map(d => d.split(' '))
			.filter(d => d[0] === 'Token')
			.map(d => [d[1], d[2] in VARIABLES ? VARIABLES[d[2]] : d[2]])
	);

	const inputTokens = {};
	for (let inputObjects of inputs) {
		const [tokenName, inputVariable] = Object.entries(inputObjects).pop();
		const inputValue = inputVariable in VARIABLES
			? VARIABLES[inputVariable]
			: inputVariable;

		if (tokenName in inputTokens) {
			inputTokens[tokenName] = inputTokens[tokenName].add(ethers.BigNumber.from(inputValue));
		} else {
			inputTokens[tokenName] = ethers.BigNumber.from(inputValue);
		}
	}


	for (let [tokenName, amount] of Object.entries(inputTokens)) {
		const balance = await signer.getBalance();
		if (tokenName === 'ETHER') {
			if (balance.lt(amount)) {
				throw new Error(
					`Ether input amount ${amount} exceeds available balance ${balance}`
				);
			}

			const tx = await signer.sendTransaction({
				to: wallet.address,
				value: amount,
			});

			const walletBalance = await ethers.provider.getBalance(wallet.address);
			if (walletBalance.lt(amount)) {
				throw new Error(
					`Ether input amount ${amount} exceeds wallet balance ${walletBalance}`
				);
			}
		} else {
			const tokenAddress = tokenDefinitions[tokenName];
			const token = new ethers.Contract(
				tokenAddress,
				["function balanceOf(address account) view returns (uint256 balance)"],
				ethers.provider,
			);
			const router = new ethers.Contract(
				"0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
				["function swapETHForExactTokens(uint amountOut, address[] calldata path, address to, uint deadline) payable returns (uint[] memory amounts)"],
				signer
			);
			const tx = await router.swapETHForExactTokens(
				amount,
				["0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2", tokenAddress],
				wallet.address,
				99999999999999,
				{value: balance.div(2)}
			);
			const walletBalance = await token.balanceOf(wallet.address);
			if (walletBalance.lt(amount)) {
				throw new Error(
					`Token input amount ${amount} exceeds wallet balance ${walletBalance}`
				);
			}
		}
	}

	const encoder = new Encoder("SWAP_ON_CURVE", VARIABLES, wallet.address);
	await encoder.parseActionScriptDefinitions();
	await encoder.constructCallsAndResultsFormat();

	const callResults = await wallet.callStatic.simulate(encoder.calls);

	const parserArgs = {
		actionScriptName: "SWAP_ON_CURVE",
        calls: encoder.calls,
        callResults,
		callABIs: encoder.callABIs,
		resultToParse: encoder.resultToParse,
        contract: wallet,
	};

	const resultsParser = new ResultsParser(parserArgs);

	const { success, results } = await resultsParser.parse();

	let execution = await wallet.execute(encoder.calls);
	execution = await execution.wait();
	const logs = execution.logs;

	const events = [];
	for (let log of logs) {
		let currentEvent = null;
		try {
			currentEvent = wallet.interface.parseLog(log);
		} catch (error) {
			try {
				const erc20Interface = new ethers.utils.Interface(ERC20_ABI);
				currentEvent = erc20Interface.parseLog(log);
			} catch (error) {
				try {
					const abi = await getABI(log.address);
					const contractInterface = new ethers.utils.Interface(abi);
					currentEvent = contractInterface.parseLog(log);
				} catch (error) {
					console.error('ERROR', error.message);
				}
			}
		}
		events.push(currentEvent);
	}

	console.log(JSON.stringify(events, null, 2));
}

main()
	.then(() => process.exit(0))
	.catch(error => {
		console.error(error);
		process.exit(1);
	});