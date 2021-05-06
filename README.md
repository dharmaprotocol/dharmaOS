# 🔌 dharmaOS
**dharmaOS** is an open SDK that allows developers to connect any EVM protocol action to Dharma's high-grade fiat
on and off ramps.  The **dharmaOS** system ingests simple YAML files called "action scripts" that can be either manually or programmatically generated.

These files specify a sequence of Ethereum function calls and necessary metadata to bridge the raw inputs and outputs of those transactions to a user-friendly interface with proper semantic context.

Given a properly-formatted "action script":
- The Dharma app automatically generates a UI for the action
- If the "action" either ingests or spits out USDC as an input or output, gives users the capability to execute the action directly from / to their bank account
- Actions can similarly ingest tokens that are in escrow "lock up" in the app, and tokens outputted by the action will inherit the input tokens' escrow period.

**dharmaOS** is currently in **invite-only alpha mode** — you can request an invite to the SDK [here](https://dharma-feedback.typeform.com/to/cWofOmkP).
Throughout Q2 of 2021, our goal is to open up self-service access to **dharmaOS** to the general public — replicating an experience akin to the Apple App Store, but housed in a Coinbase-like crypto wallet. 

# 🏦 The Problem With Fiat On-Ramps in Web3
In order to understand **dharmaOS**, it's important to understand the secret sauce behind Dharma's onramp.  In crypto-land,
fiat on and off ramps have historically fallen into two categories – fiat exchanges (e.g. Coinbase) and drop-in APIs (e.g. Wyre / MoonPay / etc.).

The former tend to be cheap and high-volume supporting, but very incompatible with web3 wallets — a typical purchase of ETH / USDC can take up to a week to be withdrawable to a web3-compatible wallet.

The latter provide instant settlement to web3 wallets, but tend to have unworkably low limits (e.g. $500 / week) and egregiously high fees due to reliance on debit card networks.

The fundamental constraining factor that drives these tradeoffs is fraud risk — the entire game of being a fiat-to-crypto onramp is one of underwriting the risk that a user is fraudulently using a stolen debit card / bank account to steal crypto from you.  Fiat exchanges mitigate that risk by not letting you withdraw instantly.  Drop-in APIs mitigate that risk by only supporting expensive, instant-confirmation payments (e.g. cards) and having very low limits.  **In both cases, the web3-aspirational user suffers**.

# 🥜 Dharma's Approach In A Nutshell
Dharma is able to underwrite cheap, instant fiat-originated exposure to any protocol in Ethereum by recreating fiat-exchange escrow requirements in a non-custodial web3 context through smart contracts.

When a user makes a $25k deposit into, say, Compound on Dharma, Dharma initiates a debit of their bank account (which can take several days to clear), but then instantly advances the user 25k in USDC on-chain and executes their desired action through **dharmaOS** (i.e. in this case, minting a cToken).

The output tokens from this action (i.e. cUSDC) are defined in the corresponding action script, and are held in escrow for 5 days in a smart contract that gives Dharma the right to claw back the funds in the case of fraud.  After 5 days, the smart contract settles funds to the user's smart wallet, and the funds become non-custodial.

An honest user is not exposed to this process because the Dharma wallet displays escrowed balances as inlined with non-custodial balances.

Tokens in a user's wallet that are in escrow aren't frozen artifacts — they can be used as input tokens in any approved action script in **dharmaOS**.  For instance, a user can buy $25k of Ether, and then immediately deposit that Ether (which would then be "under lockup") into a staking protocol like Lido, or bid that Ether on an NFT in Foundation / Zora / OpenSea / etc.

The goal for **dharmaOS** is to expand the inventory of supported "actions" a user can take from their bank account / escrowed balances to *everything* in Ethereum — and to eventually expose the triggering of fiat-enabled actions to contexts outside of the Dharma app (i.e. in dApps via WalletConnect)
## Usage
1. set up `.env` file:
```
WEB3_PROVIDER_URLS_BY_CHAINID='{"1":"<ethereum_mainnet_provider_url>","137":"<polygon_mainnet_provider_url>",...}'
ETHERSCAN_API_KEY='<an Etherscan API key>'
```

2. install, compile contract and action scripts, and run all the tests
```
$ yarn install
$ yarn build
$ yarn test
```
3. author an action script and place it in a project-specific directory in `action-scripts`, then run `yarn build` again and correct any issues that are surfaced

4. create a test / tests for the action script, either:
- manually via a testfile in `action-script-tests` with the same name / subdirectory as the action script being tested
- automatically via `yarn generate`, which takes you through an interactive prompt where you'll be able to choose the action script and fill out all the input variables

5. ensure that the new test(s) are passing via `yarn test` and make a pull request.

## Specification
The Primary action script format is a human-readable YAML file — this is convertible to and from a machine-readable JSON file that will be what is stored in the database and used to compile payloads.

This file contains 11 required fields:

- name: a unique identifier for the action script
- summary: a string that provides a summary of the action script in question. Note that the summary should be in the present tense.
- variables: a name ⇒ type mapping of arguments that need to be supplied to action script. `wallet` is included by default and represents the address of the caller.
    - `bool`, `bytesXXX`, `uintXXX`, `intXXX`, `address`
    - `bool[N]`, `bytesXXX[N]`, `uintXXX[N]`, `intXXX[N]`, `address[N]`, `bool[N][M]`...
    - `bytes`, `string`, `struct(type, type...)`
- results: a name ⇒ type mapping of values that will be returned by action script
- chainId: an integer representing the chain to execute the action script against (defaults to 1)
- definitions: a list of contracts / tokens, functions, and other actions used by the action script (`<definitionName>` is where an arbitrary name is declared for each and is what is used throughout the action script)
    - Contract `<contractName>` `contractAddress`
    - Token `<contractName>` `contractAddress` (same as Contract but adds all ERC20 methods)
    - Function `<functionName>` `contractName` `functionSignature` ⇒ `returnTypes`
    - Action `<actionName>` `actionName`
- inputs: a list of defined Tokens and the raw amount of that token that can be either approved or transferred
- actions: a list of steps to take as part of the action script (including calling other action scripts). If the argument or result in question has the same variable name as the target action script, that name may be used — otherwise, the argument or result should be formated as `targetActionScriptVariable:sourceActionScriptVariable`. Note that arguments may be reused, but results can only be declared once, and (as of now) results cannot be used as arguments in subsequent steps. Actions may also employ "conditionals" — see "Notes" below for details.
    - `actionName` `argument1` `targetActionScripVariableName:argument2` ⇒ `result1` `targetActionScripResultName:result2`
    - `contractName` `functionName` `argument3` `argument4` ⇒ `result3` `result4`
    - `Operation` `<math>` ⇒ `result5`
- operations: a list of simple expressions that are evaluated in sequence after all actions are complete for the purpose of defining modified results (note that these could also be run *before* action execution if necessary, but not during):
    - `a + b => c`
    - `a - b => c`
    - `a * b => c`
    - `a / b => c`
    - `a ** b => c`
- outputs: a list of defined tokens and the raw amount of that token that the balance prior to execution of the action script must increase by. Each action script (i.e. imported action scripts as well as the importing action script) will enforce its own input and output checks independently.
- associations: a list of defined tokens along with variables or results that are "associated" with that token, i.e. should be denominated in the specified token.
- description: a string that summarizes the action taking place and that will be used to populate notifications, emails, and activity feed cards by default. Simulated results will be used until an action's transaction has mined, at which point realized results will be used. Token helpers, such as name / symbol / decimals, will be available in order to parse addresses and amounts into human-readable representations. Note that the description should be in the present tense.

### Example
##### YAML
```yaml
name: "MINT_TO_YVAULT_V1"

summary: "Mint yTokens using yearn V1"

variables:
  suppliedTokenAddress: address
  suppliedAmount: uint256
  yVaultAddress: address

results:
  yVaultReceivedAmount: uint256

chainId: 1

definitions:
 - Token UNDERLYING suppliedTokenAddress
 - Token yVAULT yVaultAddress
 - Function mintYVault yVAULT deposit(uint256)

inputs:
 - UNDERLYING: suppliedAmount

actions:
 - yVAULT balanceOf wallet => yVaultInitialAmount
 - UNDERLYING approve yVAULT suppliedAmount
 - yVAULT mintYVault suppliedAmount
 - yVAULT balanceOf wallet => yVaultFinalAmount

operations:
 - yVaultFinalAmount - yVaultInitialAmount => yVaultReceivedAmount

outputs:
 - yVAULT: yVaultReceivedAmount

associations: # N/A

description: "Mint ${yVaultReceivedAmount:yVAULT.decimals} ${yVAULT.symbol} using ${suppliedAmount:UNDERLYING.decimals} ${UNDERLYING.symbol}"
```
##### JSON
```json
{
   "name": "MINT_TO_YVAULT_V1",
   "summary": "Mint yTokens using yearn V1",
   "variables": {
      "suppliedTokenAddress": "address",
      "suppliedAmount": "uint256",
      "yVaultAddress": "address"
   },
   "results": {
      "yVaultReceivedAmount": "uint256"
   },
   "chainId": 1,
   "definitions": [
      "Token UNDERLYING suppliedTokenAddress",
      "Token yVAULT yVaultAddress",
      "Function mintYVault yVAULT deposit(uint256)"
   ],
   "inputs": [
      {
         "UNDERLYING": "suppliedAmount"
      }
   ],
   "actions": [
      "yVAULT balanceOf wallet => yVaultInitialAmount",
      "UNDERLYING approve yVAULT suppliedAmount",
      "yVAULT mintYVault suppliedAmount",
      "yVAULT balanceOf wallet => yVaultFinalAmount"
   ],
   "operations": [
      "yVaultFinalAmount - yVaultInitialAmount => yVaultReceivedAmount"
   ],
   "outputs": [
      {
         "yVAULT": "yVaultReceivedAmount"
      }
   ],
   "associations": [],
   "description": "Mint ${yVaultReceivedAmount:yVAULT.decimals} ${yVAULT.symbol} using ${suppliedAmount:UNDERLYING.decimals} ${UNDERLYING.symbol}"
}
```


## Notes

To set an action script and variables ahead of time when setting up testing for a new action script (i.e. to skip the "prompt" portion of `yarn generate`), create a `test-generation-config.js` file. Example formatting:

```js
module.exports = {
  actionScriptName: "SWAP_ON_BALANCER_VIA_EXCHANGE_PROXY",
  variables: {
    soldTokenAddress: "0x6B175474E89094C44Da98b954EedeAC495271d0F",
    boughtTokenAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
    soldTokenAmount: "10000000000000000000",
    minimumBoughtTokenAmount: "9000000",
    maximumNumberOfPools: "3",
  }
};
```

To use "conditional" actions, where a batch of actions to be performed is determined by the result of a stated condition, format the action as follows (note that only direct comparisons of defined tokens to other defined tokens or Ether are currently supported):
```yaml
actions:
 - if:
    condition: TOKEN is ETHER
    then:
       - ETHER to:amount
    else:
       - TOKEN transfer to amount
```
