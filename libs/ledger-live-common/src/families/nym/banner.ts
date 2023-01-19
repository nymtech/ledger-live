import { getCurrentNymPreloadData } from "./preloadedData";
import { LEDGER_VALIDATOR_ADDRESS } from "./utils";
import { canDelegate, canRedelegate } from "./logic";
import type { NymAccount, NymValidatorItem } from "./types";

export interface AccountBannerState {
  display: boolean;
  redelegate: boolean;
  validatorSrcAddress: string;
  ledgerValidator: NymValidatorItem | undefined;
}

export function getAccountBannerState(account: NymAccount): AccountBannerState {
  // Group current validator
  const nymResources = account.nymResources
    ? account.nymResources
    : { delegations: [], redelegations: [] };
  const delegationAddresses = nymResources.delegations.map((delegation) => {
    return delegation.validatorAddress;
  });
  const redelegationAddresses = nymResources.redelegations.map(
    (redelegation) => {
      return redelegation.validatorDstAddress;
    }
  );
  const validatorAdresses = [...delegationAddresses, ...redelegationAddresses];

  // Get ledger validator data
  const { validators } = getCurrentNymPreloadData();
  const ledgerValidator = validators.find(
    (validator) => validator.validatorAddress === LEDGER_VALIDATOR_ADDRESS
  );

  // Find user current worst validator (default validator is ledger)
  let worstValidator = ledgerValidator;
  for (let i = 0; i < validatorAdresses.length; i++) {
    const validatorAdress = validatorAdresses[i];
    const validator = validators.find(
      (validator) => validator.validatorAddress === validatorAdress
    );
    if (
      worstValidator &&
      validator &&
      worstValidator.commission < validator.commission &&
      canRedelegate(account, validator)
    ) {
      worstValidator = validator;
    }
  }

  let redelegate = false;
  let validatorSrcAddress = "";
  let display = false;

  if (worstValidator) {
    if (
      worstValidator?.validatorAddress === ledgerValidator?.validatorAddress
    ) {
      // Not found worst validator than ledger
      if (canDelegate(account)) {
        // Delegate remaining NYM (not staked)
        display = true;
      }
    } else {
      // Redelegate to the worst validator
      display = true;
      redelegate = true;
      validatorSrcAddress = worstValidator.validatorAddress;
    }
  }

  return {
    display,
    redelegate,
    validatorSrcAddress,
    ledgerValidator,
  };
}
