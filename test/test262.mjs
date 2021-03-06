import SemVer from "semver"

import assert from "assert"
import execa from "execa"
import fs from "fs-extra"
import globby from "globby"
import path from "path"
import test262Parser from "test262-parser"

const isV8 = Reflect.has(process.versions, "v8")

const canRunTest262 =
  isV8 &&
  process.execArgv.includes("--harmony") &&
  SemVer.satisfies(process.version, ">=10.3.0")

const fixturePath = path.resolve("test262")
const skiplistPath = path.resolve(fixturePath, "skiplist")
const test262Path = path.resolve("vendor/test262")
const wrapperPath = path.resolve(fixturePath, "wrapper.js")

const skipRegExp = /^(#.*)\n([^#\n].*)/gm
const skiplist = parseSkiplist(skiplistPath)

const test262Tests = globby.sync([
  "test/language/**/*.js",
  "!**/*_FIXTURE.js"
], {
  absolute: true,
  cwd: test262Path,
  transform: path.normalize
})

function node(args, env) {
  return execa(process.execPath, args, {
    cwd: fixturePath,
    env,
    reject: false
  })
}

function parseSkiplist(filename) {
  const content = fs.readFileSync(filename, "utf-8")
  const result = new Map

  let match

  while ((match = skipRegExp.exec(content))) {
    let [, comment, filename] = match

    filename = path.resolve(test262Path, filename)

    const reason = comment
      .slice(1)
      .trim()

    result.set(filename, {
      reason
    })
  }

  return result
}

function parseTest(filename) {
  const { attrs } = test262Parser.parseFile(fs.readFileSync(filename, "utf-8"))
  const { flags, negative } = attrs
  const description = attrs.description.trim()
  const errorType = negative ? negative.type : void 0
  const isAsync = !! (flags && flags.async)

  return {
    description,
    errorType,
    isAsync
  }
}

function runEsm(filename, args, env) {
  return node([
    "-r", "esm",
    filename, ...args
  ], env)
}

describe("test262 tests", function () {
  this.timeout(0)

  before(function () {
    if (! canRunTest262) {
      this.skip()
    }
  })

  for (const filename of test262Tests) {
    const skipped = skiplist.get(filename)
    const testData = parseTest(filename)

    const description =
      testData.description +
      " (" + path.basename(filename) + ")" +
      (skipped ? "; " + skipped.reason : "")

    it(description, function () {
      const { isAsync } = testData

      return runEsm(wrapperPath, [
        filename,
        isAsync
      ], { ESM_OPTIONS: "{cjs:0,mode:all}" })
      .then(({ stderr, stdout }) => {
        if (skipped &&
            isAsync) {
          this.skip()
        }

        if (stderr) {
          if (skipped) {
            this.skip()
          }

          assert.fail(stderr)
        }

        if (stdout) {
          const { name } = JSON.parse(stdout)
          const expected = testData.errorType

          // Known test262 constructors:
          // ReferenceError, SyntaxError, Test262Error, TypeError
          if (skipped) {
            if (name !== expected ||
                name !== "SyntaxError") {
              assert.notStrictEqual(name, expected)
            }

            this.skip()
          } else {
            assert.strictEqual(name, expected)
          }
        } else if (skipped) {
          this.skip()
        }
      })
    })
  }
})
