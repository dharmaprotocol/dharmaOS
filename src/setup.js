const hre = require("hardhat");
const ethers = hre.ethers;
const { Validator } = require('./Validator');

async function main() {
  const signers = await ethers.getSigners();
  const signer = signers[0];

  const Wallet = await ethers.getContractFactory("Wallet");
  const wallet = await Wallet.deploy(signer.address);

  const actionScript = await Validator.getActionScript("SWAP_ON_CURVE");
  const { definitions, inputs } = actionScript;

  const VARIABLES = {
  	soldTokenAmount: 100,
  	soldTokenAddress: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
  	boughtTokenAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
  }

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

  // TODO: feed variables into Encoder in order to get calls
  const calls = [{
  	to: "0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2",
  	value: 100,
  	data: "0xd0e30db0",
  }];

  let simulation = await wallet.callStatic.simulate(calls);
  console.log({simulation});

  let execution = await wallet.execute(calls);
  execution = await execution.wait();
  const logs = execution.logs;

  const events = [];
  for (let log of logs) {
  	let currentEvent = null;
  	try {
  		currentEvent = wallet.interface.parseLog(log);
  	} catch (error) {
  		console.error('ERROR');
  	}
  	events.push(currentEvent);
  }

  console.log({events});

}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });