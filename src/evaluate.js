const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const ethers = hre.ethers;
const axios = require("axios");
const { Importer } = require("./importer");
const { Encoder } = require("./encoder");
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

const ETHER_ADDRESS = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

const getRandomArbitrary = (min, max) => Math.random() * (max - min) + min;

const longer = () =>
    new Promise((resolve) => {
        setTimeout(() => {
            resolve();
        }, getRandomArbitrary(700, 5000));
    });

const get = async (url, params = {}, retries = 0) => {
    try {
        const response = await axios.get(url, params);
        const data = response.data;
        if (data.status === "0" && typeof data.result === "string") {
            throw new Error(`BAD REQUEST: ${data}`);
        }
        return data;
    } catch (error) {
        if (retries > 3) {
            throw new Error(`MAX RETRIES EXCEEDED: ${error.message}`);
        }
        await longer();
        return await get(url, params, retries + 1);
    }
};

const getFilePaths = (dir) => {
    const dirents = fs.readdirSync(dir, { withFileTypes: true });
    const files = dirents.map((dirent) => {
        const res = path.resolve(dir, dirent.name);
        return dirent.isDirectory() ? this.getFilePaths(res) : res;
    });
    return files.flat();
};

const getABI = async (account) => {
    // first see if a file with account name is in `contractABIs` directory
    const contractABIDir = path.resolve(__dirname, "../contractABIs");
    try {
        await fs.promises.mkdir(contractABIDir);
    } catch (e) {}

    const contractABIPath = `${path.resolve(
        contractABIDir,
        account.toLowerCase()
    )}.json`;

    let abi;
    try {
        abi = fs.readFileSync(contractABIPath, "utf8");
    } catch (error) {
        console.log(`no ABI found for account "${account}", retrieving... (${error.message})`)
        const data = await get("https://api.etherscan.io/api", {
            params: {
                module: "contract",
                action: "getabi",
                address: account,
                apikey: process.env.ETHERSCAN_API_KEY,
            },
        });

        if (
            data &&
            data.status === "1" &&
            data.message === "OK" &&
            data.result
        ) {
            abi = data.result;
        } else {
            throw new Error(`bad Etherscan response: ${data}`);
        }

        fs.writeFileSync(contractABIPath, abi, "utf8", (err) => {
            if (err) {
                throw new Error(`Could not write ABI to file: ${err.message}`);
            }
        });
    }

    try {
        if (typeof abi !== 'object') {
            abi = JSON.parse(abi);
        }
    } catch (error) {
        throw new Error(
            `Could not parse ABI found for account "${account}": ${error.message})`
        );
    }

    return abi;
};

function parseLogIncludingAnonymous(log, abi) {
    let event;
    try {
        const contractInterface = new ethers.utils.Interface(
            abi
        );
        event = contractInterface.parseLog(log);
    } catch (error) {
        const anonymousEvents = abi
            .filter(x => x.type === 'event' && !!x.anonymous);

        let located = false;
        for (const {name, inputs} of anonymousEvents) {
            const taggedInputs = inputs.map((input, i) => ({i, ...input}));
            const indexedInputs = taggedInputs.filter(input => !!input.indexed)
            if (indexedInputs.length === log.topics.length) {
                try {
                    // decode data using unindexed inputs
                    const unindexedInputs = taggedInputs
                        .filter(input => !input.indexed);
                    const decodedDataValues = ethers.utils.defaultAbiCoder.decode(
                        unindexedInputs.map(input => input.type), log.data
                    );

                    const unindexedInputsWithValues = [];
                    for (const [i, unindexedInput] of Object.entries(unindexedInputs)) {
                        const decodedData = {
                            ...unindexedInput,
                            value: decodedDataValues[i],
                        }

                        unindexedInputsWithValues.push(decodedData);
                    }

                    // decode each indexed input (use bytes32 for dynamic types)
                    const indexedInputsWithValues = [];
                    for (const [i, indexedInput] of Object.entries(indexedInputs)) {
                        const topic = log.topics[i];

                        // TODO: all dynamically-sized types should be cast to bytes32
                        const decodedTopicValue = ethers.utils.defaultAbiCoder.decode(
                            [indexedInput.type], topic
                        )[0];

                        const decodedTopic = {
                            ...indexedInput,
                            value: decodedTopicValue,
                        }

                        indexedInputsWithValues.push(decodedTopic);
                    }

                    // order based on the inputs
                    const inputsWithValues = indexedInputsWithValues
                        .concat(unindexedInputsWithValues)
                        .sort((a, b) => a.i - b.i)
                        .map(input => [input.name, input.value]);

                    // add index access and set final event
                    event = {
                        name,
                        args: {
                            ...Object.fromEntries(Array(inputsWithValues.length).fill().map((_, i) => [i, inputsWithValues[i][1]])),
                            ...Object.fromEntries(inputsWithValues),
                        }
                    }

                    // Note: there might be other anonymous events that
                    // could be decoded — may want to check each of them.
                    located = true;
                    break;

                } catch (decodeError) { }
            }
        }

        if (!located) {
            throw new Error(error);
        }
    }

    return event;
}

async function incrementFixedTime(timestamp) {
    const incrementedTimestamp = timestamp + 1000;
    await hre.network.provider.request({
        method: "evm_setNextBlockTimestamp",
        params: [incrementedTimestamp],
    });

    return incrementedTimestamp;
}

async function evaluate(actionScriptName, variables, blockNumber) {
    await hre.network.provider.request({
        method: "hardhat_reset",
        params: [
            {
                forking: {
                    jsonRpcUrl: process.env.WEB3_PROVIDER_URL,
                    blockNumber,
                },
            },
        ],
    });

    let { timestamp } = await ethers.provider.getBlock(blockNumber);

    timestamp = await incrementFixedTime(timestamp);

    const signers = await ethers.getSigners();
    const signer = signers[0];

    const Wallet = await ethers.getContractFactory("Wallet");
    const wallet = await Wallet.deploy(signer.address);

    const actionScript = await Importer.getActionScript(actionScriptName);
    const { definitions, inputs } = actionScript;

    const tokenDefinitions = Object.fromEntries(
        definitions
            .map((d) => d.split(" "))
            .filter((d) => d[0] === "Token")
            .map((d) => [d[1], d[2] in variables ? variables[d[2]] : d[2]])
    );

    const inputTokens = {};
    for (let inputObjects of inputs) {
        const [tokenName, inputVariable] = Object.entries(inputObjects).pop();
        const inputValue =
            inputVariable in variables
                ? variables[inputVariable]
                : inputVariable;

        if (tokenName in inputTokens) {
            inputTokens[tokenName] = inputTokens[tokenName].add(
                ethers.BigNumber.from(inputValue)
            );
        } else {
            if (!isNaN(parseInt(inputValue))) {
                inputTokens[tokenName] = ethers.BigNumber.from(inputValue);
            } else {
                // Fallback to a default input value
                inputTokens[tokenName] = ethers.BigNumber.from(
                    "1".padEnd(18, "0")
                );
            }
        }
    }

    for (let [tokenName, amount] of Object.entries(inputTokens)) {
        const balance = await signer.getBalance();
        if (
            tokenName === "ETHER" ||
            tokenDefinitions[tokenName] === ETHER_ADDRESS
        ) {
            if (balance.lt(amount)) {
                throw new Error(
                    `Ether input amount ${amount} exceeds available balance ${balance}`
                );
            }

            await signer.sendTransaction({
                to: wallet.address,
                value: amount,
            });

            timestamp = await incrementFixedTime(timestamp);

            const walletBalance = await ethers.provider.getBalance(
                wallet.address
            );
            if (walletBalance.lt(amount)) {
                throw new Error(
                    `Ether input amount ${amount} exceeds wallet balance ${walletBalance}`
                );
            }
        } else {
            const tokenAddress = tokenDefinitions[tokenName];

            if (await ethers.provider.getCode(tokenAddress) === "0x") {
                throw new Error(
                    `No contract bytecode found for provided token address "${tokenAddress}"`
                );
            }

            const wethAddress = "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2";
            let token;
            if (tokenAddress === wethAddress) {
                token = new ethers.Contract(
                    wethAddress,
                    [
                        "function balanceOf(address account) view returns (uint256 balance)",
                        "function deposit() payable",
                        "function transfer(address to, uint256 amount) returns (bool)",
                    ],
                    signer
                );
                await token.deposit({ value: amount });

                timestamp = await incrementFixedTime(timestamp);

                await token.transfer(wallet.address, amount);

                timestamp = await incrementFixedTime(timestamp);
            } else {
                token = new ethers.Contract(
                    tokenAddress,
                    [
                        "event Transfer(address indexed src, address indexed dst, uint val)",
                        "function balanceOf(address account) view returns (uint256 balance)",
                    ],
                    ethers.provider
                );
                const router = new ethers.Contract(
                    "0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D",
                    [
                        "function swapETHForExactTokens(uint amountOut, address[] calldata path, address to, uint deadline) payable returns (uint[] memory amounts)",
                    ],
                    signer
                );
                try {
                    await router.swapETHForExactTokens(
                        amount,
                        [wethAddress, tokenAddress],
                        wallet.address,
                        99999999999999,
                        { value: balance.div(2) }
                    );

                    timestamp = await incrementFixedTime(timestamp);
                } catch (error) {
                    // find an account with sufficient Token amount, take over and transfer
                    let accountToTakeOver;

                    const checkedAccounts = new Set();

                    let endBlock = blockNumber;
                    let startBlock = blockNumber - 1000;

                    while (startBlock > blockNumber - 10000000) {
                        let foundAccount = false;

                        const transferEvents = await token.queryFilter(
                            "Transfer",
                            startBlock,
                            endBlock
                        );

                        const events = transferEvents
                            .reverse()
                            .filter((event) => {
                                const account = event.args[1];
                                const transferAmount = event.args[2];
                                return (
                                    transferAmount.gt(amount) &&
                                    !checkedAccounts.has(account)
                                );
                            });

                        for (let event of events) {
                            accountToTakeOver = event.args[1];

                            checkedAccounts.add(accountToTakeOver);

                            const currentBalance = await token.balanceOf(
                                accountToTakeOver
                            );

                            if (currentBalance.gt(amount)) {
                                foundAccount = true;
                                break;
                            }
                        }

                        if (foundAccount) {
                            break;
                        }

                        endBlock = startBlock;
                        startBlock -= 1000;
                    }

                    await signer.sendTransaction({
                        to: accountToTakeOver,
                        value: ethers.utils.parseEther("1"),
                    });

                    timestamp = await incrementFixedTime(timestamp);

                    await hre.network.provider.request({
                        method: "hardhat_impersonateAccount",
                        params: [accountToTakeOver],
                    });

                    const impersonatedSigner = await ethers.provider.getSigner(
                        accountToTakeOver
                    );

                    token = new ethers.Contract(
                        tokenAddress,
                        [
                            "function transfer(address to, uint256 amount) returns (bool)",
                        ],
                        impersonatedSigner
                    );

                    await token.transfer(wallet.address, amount);

                    await hre.network.provider.request({
                        method: "hardhat_stopImpersonatingAccount",
                        params: [accountToTakeOver],
                    });

                    timestamp = await incrementFixedTime(timestamp);

                    token = new ethers.Contract(
                        tokenAddress,
                        [
                            "function balanceOf(address account) view returns (uint256 balance)",
                        ],
                        ethers.provider
                    );

                    // // find latest Transfer event for tokenAddress and take over account
                    // throw new Error(`Could not obtain input token "${tokenAddress}" from Uniswap`);
                }
            }
            const walletBalance = await token.balanceOf(wallet.address);
            if (walletBalance.lt(amount)) {
                throw new Error(
                    `Token input amount ${amount} exceeds wallet balance ${walletBalance}`
                );
            }
        }
    }

    const encoderArgs = {
        actionScript,
        variables,
        wallet: wallet.address,
    };

    const {
        calls,
        callABIs,
        resultToParse,
        isAdvanced
    } = await Encoder.encode(encoderArgs);

    const simulateTarget = !isAdvanced ? 'simulate' : 'simulateAdvanced';
    const callResults = await wallet.callStatic[simulateTarget](calls);

    const parserArgs = {
        actionScript,
        calls,
        callResults,
        callABIs,
        resultToParse,
        contract: wallet,
        variables,
        isAdvanced,
    };

    const {
        success,
        results,
        revertReason,
        parsedReturnData
    } = await ResultsParser.parse(parserArgs);

    let events = {};
    if (!!success) {
        const executeTarget = !isAdvanced ? 'execute' : 'executeAdvanced';
        let execution = await wallet[executeTarget](calls);
        execution = await execution.wait();
        const logs = execution.logs;

        const rawEvents = [];
        for (let log of logs) {
            let currentEvent = null;
            try {
                // First try parsing the event using the wallet interface itself
                currentEvent = wallet.interface.parseLog(log);
            } catch (error) {
                try {
                    // Next, try parsing it as an ERC20 token
                    const erc20Interface = new ethers.utils.Interface(
                        ERC20_ABI
                    );
                    currentEvent = erc20Interface.parseLog(log);
                } catch (error) {
                    try {
                        // Then try parsing via the contract ABI from Etherscan
                        const abi = await getABI(log.address);
                        currentEvent = await parseLogIncludingAnonymous(log, abi);
                    } catch (error) {
                        try {
                            // Last-ditch attempt: look for a proxy contract ABI
                            const etherscanScrapeHTML = await get(
                                `https://etherscan.io/address/${log.address}#readProxyContract`
                            );
                            const search =
                                "ABI for the implementation contract at";
                            const relevantLine = etherscanScrapeHTML
                                .split("\n")
                                .filter((line) => line.includes(search))
                                .pop();
                            if (!!relevantLine) {
                                const proxyAddress = relevantLine
                                    .match(/<a href='\/address\/(.*?)#code'>/g)[0]
                                    .slice(18, -7);

                                const proxy = ethers.utils.getAddress(proxyAddress);
                                const proxyABI = await getABI(proxy);
                                currentEvent = await parseLogIncludingAnonymous(log, proxyABI);
                            } else {
                                console.error(
                                    `ERROR: could not retrieve the contract ABI for contract "${log.address}" — Try setting the file manually.`
                                );
                                process.exit(1);
                            }
                        } catch (error) {
                            console.error("ERROR:", error.message);
                            process.exit(1);
                        }
                    }
                }
            }

            const allArgs = Object.entries({ ...currentEvent.args });
            const namedArgs = Object.fromEntries(
                allArgs
                    .slice(allArgs.length / 2)
                    .map(([key, value]) => [
                        key,
                        ethers.BigNumber.isBigNumber(value)
                            ? value.toString()
                            : value,
                    ])
            );

            const event = {
                address: log.address,
                name: currentEvent.name,
                args: namedArgs,
            };

            rawEvents.push(event);
        }

        const hasFailures = rawEvents.some(
            (event) =>
                event.address === wallet.address && event.name === "CallFailure"
        );

        if (hasFailures) {
            throw new Error("FAILING!");
        }

        events = rawEvents.filter((event) => event.address !== wallet.address);
    }

    return {
        success,
        results,
        events,
        parsedReturnData,
        revertReason,
        wallet: wallet.address,
    };
}

module.exports = {
    evaluate,
};
