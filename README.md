# action-scripts
A collection of "Action Scripts" for execution via the Dharma Smart Wallet.

## Specification
The Primary action script format is a human-readable YAML file — this is convertible to and from a machine-readable JSON file that will be what is stored in the database and used to compile payloads.

This file contains 10 required fields:

- name: a unique identifier for the action script
- variables: a name ⇒ type mapping of arguments that need to be supplied to action script. `wallet` is included by default and represents the address of the caller.
    - `bool`, `bytesXXX`, `uintXXX`, `intXXX`, `address`
    - `bool[N]`, `bytesXXX[N]`, `uintXXX[N]`, `intXXX[N]`, `address[N]`, `bool[N][M]`...
    - `bytes`, `string`, `struct(type, type...)`
- results: a name ⇒ type mapping of values that will be returned by action script
- definitions: a list of contracts / tokens, functions, and other actions used by the action script (`<definitionName>` is where an arbitrary name is declared for each and is what is used throughout the action script)
    - Contract `<contractName>` `contractAddress`
    - Token `<contractName>` `contractAddress` (same as Contract but adds all ERC20 methods)
    - Function `<functionName>` `contractName` `functionSignature` ⇒ `returnTypes`
    - Action `<actionName>` `actionName`
- inputs: a list of defined Tokens and the raw amount of that token that can be either approved or transferred
- actions: a list of steps to take as part of the action script (including calling other action scripts). Note that arguments may be reused, but results can only be declared once, and (as of now) results cannot be used as arguments in subsequent steps.
    - `actionName` `argument1` `argument2` ⇒ `result1` `result2`
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
- description: a string that summarizes the action taking place and that will be used to populate notifications, emails, and activity feed cards by default. Simulated results will be used until an action's transaction has mined, at which point realized results will be used. Token helpers, such as name / symbol / decimals, will be available in order to parse addresses and amounts into human-readable representations.

### Example
##### YAML
```yaml
name: "MINT_TO_YVAULT_V1"

variables:
  suppliedTokenAddress: address
  suppliedAmount: uint256
  yVaultAddress: address

results:
  yVaultReceivedAmount: uint256

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

description: "Mint ~${yVaultReceivedAmount:yVAULT.decimals} ${yVAULT.symbol} using ${suppliedAmount:UNDERLYING.decimals} ${UNDERLYING.symbol}"
```
##### JSON
```json
{
   "name": "MINT_TO_YVAULT_V1",
   "variables": {
      "suppliedTokenAddress": "address",
      "suppliedAmount": "uint256",
      "yVaultAddress": "address"
   },
   "results": {
      "yVaultReceivedAmount": "uint256"
   },
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
   "description": "Mint ~${yVaultReceivedAmount:yVAULT.decimals} ${yVAULT.symbol} using ${suppliedAmount:UNDERLYING.decimals} ${UNDERLYING.symbol}"
}
```
