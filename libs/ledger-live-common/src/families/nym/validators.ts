import { getCryptoCurrencyById } from "../../currencies"
import { NymValidatorsManager } from "./NymValidatorsManager"

const nymValidatorsManager = new NymValidatorsManager(
  getCryptoCurrencyById("nym")
)

export default nymValidatorsManager
