import invariant from "invariant";
import { BigNumber } from "bignumber.js";
import { getCurrentNymPreloadData } from "./preloadedData";
import { getAccountUnit } from "../../account";
import { formatCurrencyUnit } from "../../currencies";
import {
  NymOperation,
  NymExtraTxInfo,
  NymPreloadData,
  NymAccount,
} from "./types";
import { mapDelegations, mapUnbondings, mapRedelegations } from "./logic";
import { getCurrentOsmosisPreloadData } from "../osmosis/preloadedData";
import type { Unit } from "@ledgerhq/types-cryptoassets";

function formatOperationSpecifics(
  op: NymOperation,
  unit: Unit | null | undefined
): string {
  const { validators } = op.extra;
  return (validators || [])
    .map(
      (v) =>
        `\n    to ${v.address} ${
          unit
            ? formatCurrencyUnit(unit, new BigNumber(v.amount), {
                showCode: true,
                disableRounding: true,
              }).padEnd(16)
            : v.amount
        }`
    )
    .join("");
}

function getCurrentNymFamilyPreloadData(currencyName: string): NymPreloadData {
  if (currencyName === "osmosis") {
    return getCurrentOsmosisPreloadData();
  } else {
    return getCurrentNymPreloadData();
  }
}

export function formatAccountSpecifics(account: NymAccount): string {
  const { nymResources } = account;
  invariant(nymResources, "nym account expected");
  const currencyName = account.currency.name.toLowerCase();
  const { validators } = getCurrentNymFamilyPreloadData(currencyName);

  const unit = getAccountUnit(account);
  const formatConfig = {
    disableRounding: true,
    alwaysShowSign: false,
    showCode: true,
  };
  let str = " ";
  str +=
    formatCurrencyUnit(unit, account.spendableBalance, formatConfig) +
    " spendable. ";

  if (nymResources?.delegatedBalance.gt(0)) {
    str +=
      formatCurrencyUnit(unit, nymResources.delegatedBalance, formatConfig) +
      " delegated. ";
  }

  if (nymResources?.unbondingBalance.gt(0)) {
    str +=
      formatCurrencyUnit(unit, nymResources.unbondingBalance, formatConfig) +
      " unbonding. ";
  }

  const mappedDelegations = mapDelegations(
    nymResources?.delegations ?? [],
    validators,
    unit
  );

  if (mappedDelegations.length) {
    str += "\nDELEGATIONS\n";
    str += mappedDelegations
      .map(
        (d) =>
          `  to ${d.validatorAddress} ${formatCurrencyUnit(unit, d.amount, {
            showCode: true,
            disableRounding: true,
          })} ${
            d.pendingRewards.gt(0)
              ? " (claimable " +
                formatCurrencyUnit(unit, d.amount, {
                  disableRounding: true,
                }) +
                ")"
              : ""
          }`
      )
      .join("\n");
  }

  const mappedUnbondings = mapUnbondings(
    nymResources?.unbondings ?? [],
    validators,
    unit
  );

  if (mappedUnbondings.length) {
    str += "\nUNDELEGATIONS\n";
    str += mappedUnbondings
      .map(
        (d) =>
          `  from ${d.validatorAddress} ${formatCurrencyUnit(unit, d.amount, {
            showCode: true,
            disableRounding: true,
          })}`
      )
      .join("\n");
  }

  const mappedRedelegations = mapRedelegations(
    nymResources?.redelegations ?? [],
    validators,
    unit
  );

  if (mappedRedelegations.length) {
    str += "\nREDELEGATIONS\n";
    str += mappedRedelegations
      .map(
        (d) =>
          `  from ${d.validatorSrcAddress} to ${
            d.validatorDstAddress
          } ${formatCurrencyUnit(unit, d.amount, {
            showCode: true,
            disableRounding: true,
          })}`
      )
      .join("\n");
  }

  return str;
}

export function fromOperationExtraRaw(
  extra: Record<string, any> | null | undefined
): NymExtraTxInfo | Record<string, any> | null | undefined {
  let e = {};
  if (extra && extra.validators) {
    e = {
      ...extra,
      validators: extra.validators.map((o) => ({
        ...o,
        amount: new BigNumber(o.amount),
      })),
    };
  }
  return e;
}
export function toOperationExtraRaw(
  extra: Record<string, any> | null | undefined
): NymExtraTxInfo | Record<string, any> | null | undefined {
  let e = {};

  if (extra && extra.validators) {
    e = {
      ...extra,
      validators: extra.validators.map((o) => ({
        ...o,
        amount: o.amount.toString(),
      })),
    };
  }
  return e;
}
export default {
  formatAccountSpecifics,
  formatOperationSpecifics,
  fromOperationExtraRaw,
  toOperationExtraRaw,
};
