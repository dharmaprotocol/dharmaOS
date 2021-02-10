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

async function evaluate(actionScriptName, variables, blockNumber) {
    await hre.network.provider.request({
        method: "hardhat_reset",
        params: [{
            forking: {
                jsonRpcUrl: process.env.WEB3_PROVIDER_URL,
                blockNumber,
            }
        }]
    });

    const signers = await ethers.getSigners();
    const signer = signers[0];

    const Wallet = await ethers.getContractFactory("Wallet");
    const wallet = await Wallet.deploy(signer.address);

    const actionScript = await Validator.getActionScript(actionScriptName);
    const { definitions, inputs } = actionScript;

    const tokenDefinitions = Object.fromEntries(
        definitions
            .map(d => d.split(' '))
            .filter(d => d[0] === 'Token')
            .map(d => [d[1], d[2] in variables ? variables[d[2]] : d[2]])
    );

    const inputTokens = {};
    for (let inputObjects of inputs) {
        const [tokenName, inputVariable] = Object.entries(inputObjects).pop();
        const inputValue = inputVariable in variables
            ? variables[inputVariable]
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

    const encoder = new Encoder(actionScriptName, variables, wallet.address);
    await encoder.parseActionScriptDefinitions();
    await encoder.constructCallsAndResultsFormat();

    const callResults = await wallet.callStatic.simulate(encoder.calls);

    const parserArgs = {
        actionScriptName,
        calls: encoder.calls,
        callResults,
        callABIs: encoder.callABIs,
        resultToParse: encoder.resultToParse,
        contract: wallet,
    };

    const resultsParser = new ResultsParser(parserArgs);

    const { success, results } = await resultsParser.parse();

    let events = {};
    if (!!success) {
        let execution = await wallet.execute(encoder.calls);
        execution = await execution.wait();
        const logs = execution.logs;

        const rawEvents = [];
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
            const allArgs = Object.entries({...currentEvent.args});
            const namedArgs = Object.fromEntries(
                allArgs
                    .slice(allArgs.length / 2)
                    .map(([key, value]) => [key, ethers.BigNumber.isBigNumber(value) ? value.toString() : value])
            );

            const event = {
                address: log.address,
                name: currentEvent.name,
                args: namedArgs,
            }

            rawEvents.push(event);
        }

        const hasFailures = rawEvents.some(
            event => event.address === wallet.address && event.name === 'CallFailure'
        );

        if (hasFailures) {
            throw new Error("FAILING!");
        }

        events = rawEvents.filter(
            event => event.address !== wallet.address
        );
    }

    return {
        success,
        results,
        events,
    }
}

async function runTest(test) {
    const {
        actionScriptName,
        variables,
        blockNumber,
        results: expectedResults = {},
        events: expectedEvents = [],
    } = test;

    const {
        success,
        results: evaluatedResults,
        events: evaluatedEvents
    } = await evaluate(
        actionScriptName,
        variables,
        blockNumber
    );

    let fail = false;
    if (!success) {
        console.error("FAIL!")
        fail = true;
    }

    for (const [resultName, resultValue] of Object.entries(expectedResults)) {
        if (evaluatedResults[resultName] !== resultValue) {
            console.error(`evaluated result ${evaluatedResults[resultName]} not equal to expected ${resultValue}`);
            fail = true;
        }
    }

    if (evaluatedEvents.length !== expectedEvents.length) {
        console.error(`evaluated ${evaluatedEvents.length} events, expected ${expectedEvents.length}`);
        fail = true;
    }

    for (const [i, { address: expectedAddress, name: expectedName, args: expectedArgs }] of Object.entries(expectedEvents)) {
        const {
            address: evaluatedAddress,
            name: evaluatedName,
            args: evaluatedArgs,
        } = evaluatedEvents[i]
        if (evaluatedAddress !== expectedAddress) {
            console.error(`evaluated event address ${evaluatedAddress} not equal to expected ${expectedAddress}`);
            fail = true;
        }
        if (evaluatedName !== expectedName) {
            console.error(`evaluated event name ${evaluatedName} not equal to expected ${expectedName}`);
            fail = true;
        }
        for (const [expectedArgName, expectedArgValue] of Object.entries(expectedArgs)) {
            if (evaluatedArgs[expectedArgName] !== expectedArgValue) {
                console.error(`evaluated arg ${evaluatedArgs[expectedArgName]} not equal to expected ${expectedArgValue}`);
                fail = true;
            }
        }
    }

    if (!fail) {
        console.log(`${actionScriptName} — Test passed!`);
    } else {
        console.error(`${actionScriptName} — Test failed!!!`);
        console.log(evaluatedResults);
        console.log(evaluatedEvents);
    }
}

module.exports = {
    evaluate,
};