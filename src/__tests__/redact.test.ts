// 隐私脱敏规则单测：内置格式命中 / 长度门槛防误伤 / 自定义规则与禁用（C3 配置即时生效）
import { describe, it, expect, afterEach } from "vitest"
import { mkdtempSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { redactText } from "../privacy/redact"
import { resetToolkitConfigCache } from "../config"

const cwd = process.cwd()

afterEach(() => {
  process.chdir(cwd)
  resetToolkitConfigCache()
})

// 构造带 .toolkitrc.json 的临时目录并进入（结束后恢复 cwd）
function enterCfgDir(cfg: string): string {
  const dir = mkdtempSync(join(tmpdir(), "tk-redact-"))
  writeFileSync(join(dir, ".toolkitrc.json"), cfg, "utf8")
  process.chdir(dir)
  resetToolkitConfigCache()
  return dir
}

describe("redactText 内置规则", () => {
  it("命中新补充的密钥格式", () => {
    expect(redactText(`github_pat_${"A".repeat(22)}_${"B".repeat(59)}`, true)).toBe("github_pat_****")
    expect(redactText(`sk-proj-${"B".repeat(40)}${"C".repeat(10)}`, true)).toBe("sk-proj-****")
    expect(redactText("xapp-1-AB12CD34-5678901234-abcdefghijklmn", true)).toBe("xapp-****")
  })

  it("经典格式仍命中", () => {
    expect(redactText(`ghp_${"A".repeat(36)}`, true)).toBe("ghp_****")
    expect(redactText(`sk-${"A".repeat(48)}`, true)).toBe("sk-****")
    expect(redactText("xoxb-1234567890-abcdefghij", true)).toBe("xoxb-****")
    expect(redactText("AKIAIOSFODNN7EXAMPLE", true)).toBe("AKIA****")
  })

  it("JWT 仅要求头段 eyJ", () => {
    const jwt = "Bearer eyJhbGciOiJIUzI1NiJ9.ezIwMjYwOTAzfWp3dHNhbXBsZQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c"
    expect(redactText(jwt, true)).toBe("Bearer eyJ***.***.***")
  })

  it("邮箱/手机/内网 IP 兜底规则不回归", () => {
    expect(redactText("联系 tqy@fxri.net", true)).toBe("联系 t***@***.net")
    expect(redactText("13812345678", true)).toBe("138****5678")
    expect(redactText("http://10.0.0.6:8080/api", true)).toBe("http://***:8080/api")
    expect(redactText("192.168.1.88", true)).toBe("192.168.***.***")
  })

  it("短样本/正常文本不误伤（长度门槛）", () => {
    expect(redactText("ghp_AbCdEf1234567890xYz", true)).toBe("ghp_AbCdEf1234567890xYz")
    expect(redactText("github_pat_ABC1234567890abcdef", true)).toBe("github_pat_ABC1234567890abcdef")
    expect(redactText("sk-ABCDEF123", true)).toBe("sk-ABCDEF123")
    expect(redactText("版本 1.0.1 发布", true)).toBe("版本 1.0.1 发布")
    expect(redactText("验证码 COD-123456", true)).toBe("验证码 COD-123456")
  })

  it("redact=false 原样返回", () => {
    expect(redactText("联系 tqy@fxri.net 13812345678", false)).toBe("联系 tqy@fxri.net 13812345678")
  })

  it("配置：disable 手机号 + 自定义规则即时生效（C3）", () => {
    const dir = enterCfgDir(JSON.stringify({
      redact: {
        enabled: true,
        disable: ["手机号"],
        rules: [{ name: "自定义单号", pattern: "PRJ-[0-9]{4}", flags: "i", replacement: "PRJ-****" }],
      },
    }))
    const out = redactText("邮箱 tqy@fxri.net 电话 13812345678 单号 PRJ-1234", true)
    expect(out).toBe("邮箱 t***@***.net 电话 13812345678 单号 PRJ-****")
    process.chdir(cwd)
    resetToolkitConfigCache()
    rmSync(dir, { recursive: true, force: true })
  })
})
