import url from "url"
import safe from "../util/safe.js"
import shared from "../shared.js"

const safeUrl = shared.inited
  ? shared.module.safeUrl
  : shared.module.safeUrl = safe(url)

export const {
  parse,
  Url
} = safeUrl

export default safeUrl
