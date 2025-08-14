import { createRequire } from "module"
import qrcode from "qrcode-terminal"
import pkg from "@whiskeysockets/baileys"
const {
  makeWASocket,
  useMultiFileAuthState: createAuthState,
  DisconnectReason,
  Browsers,
  downloadMediaMessage,
  getContentType,
} = pkg
import { Boom } from "@hapi/boom"
import P from "pino"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"
import { dirname } from "path"
import { pathToFileURL } from "url"
import { watchFile, unwatchFile } from "fs"
import readline from "readline"
import globalConfig from "./src/settings/config.js"
import crypto from "crypto"
import { promisify } from "util"

const nodeVersion = process.versions.node.split(".")[0]
if (Number.parseInt(nodeVersion) < 20) {
  console.error("\x1b[31m%s\x1b[0m", "╔════════════════════════════════════════════════════════╗")
  console.error("\x1b[31m%s\x1b[0m", "║                   ERROR: NODE.JS VERSION               ║")
  console.error("\x1b[31m%s\x1b[0m", "╚════════════════════════════════════════════════════════╝")
  console.error("\x1b[31m%s\x1b[0m", `[ERROR] You are using Node.js v${process.versions.node}`)
  console.error("\x1b[31m%s\x1b[0m", "[ERROR] Kyakuya requires Node.js v20 or higher to run properly")
  console.error("\x1b[31m%s\x1b[0m", "[ERROR] Please update your Node.js installation and try again")
  console.error("\x1b[31m%s\x1b[0m", "[ERROR] Visit https://nodejs.org to download the latest version")
  console.error("\x1b[31m%s\x1b[0m", "╔════════════════════════════════════════════════════════╗")
  console.error("\x1b[31m%s\x1b[0m", "║                  SHUTTING DOWN...                      ║")
  console.error("\x1b[31m%s\x1b[0m", "╚════════════════════════════════════════════════════════╝")
  process.exit(1)
}

let currentSock = null
let loginMethod = "qr"
let rl = null

const require = createRequire(import.meta.url)
const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const colors = {
  reset: "\x1b[0m",
  bright: "\x1b[1m",
  dim: "\x1b[2m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
}

const mimeTypes = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp",
  mp4: "video/mp4",
  avi: "video/x-msvideo",
  mov: "video/quicktime",
  webm: "video/webm",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  ogg: "audio/ogg",
  m4a: "audio/mp4",
  pdf: "application/pdf",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  zip: "application/zip",
  rar: "application/x-rar-compressed",
  txt: "text/plain",
  json: "application/json",
  xml: "application/xml",
  html: "text/html",
  css: "text/css",
  js: "application/javascript",
}

const getMimeType = (filename) => {
  const ext = path.extname(filename).toLowerCase().slice(1)
  return mimeTypes[ext] || "application/octet-stream"
}

const getFileExtension = (mimeType) => {
  const entry = Object.entries(mimeTypes).find(([, mime]) => mime === mimeType)
  return entry ? entry[0] : "bin"
}

const isImage = (mimeType) => mimeType && mimeType.startsWith("image/")
const isVideo = (mimeType) => mimeType && mimeType.startsWith("video/")
const isAudio = (mimeType) => mimeType && mimeType.startsWith("audio/")
const isDocument = (mimeType) => mimeType && mimeType.startsWith("application/")

const generateFileName = (ext = "bin") => {
  const timestamp = Date.now()
  const random = crypto.randomBytes(4).toString("hex")
  return `file_${timestamp}_${random}.${ext}`
}

const formatFileSize = (bytes) => {
  if (bytes === 0) return "0 Bytes"
  const k = 1024
  const sizes = ["Bytes", "KB", "MB", "GB"]
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return Number.parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i]
}

const downloadMedia = async (message, filename) => {
  try {
    const buffer = await downloadMediaMessage(message, "buffer", {})
    if (filename) {
      fs.writeFileSync(filename, buffer)
    }
    return buffer
  } catch (error) {
    throw new Error(`Failed to download media: ${error.message}`)
  }
}

const getMessageType = (message) => {
  const type = getContentType(message)
  return type?.replace("Message", "") || "text"
}

const getRandom = (ext = "") => {
  return `${Math.floor(Math.random() * 10000)}${ext}`
}

const sleep = promisify(setTimeout)

const isUrl = (text) => {
  const urlRegex = /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/
  return urlRegex.test(text)
}

const runtime = (seconds) => {
  seconds = Number(seconds)
  const d = Math.floor(seconds / (3600 * 24))
  const h = Math.floor((seconds % (3600 * 24)) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.floor(seconds % 60)
  const dDisplay = d > 0 ? d + (d == 1 ? " day, " : " days, ") : ""
  const hDisplay = h > 0 ? h + (h == 1 ? " hour, " : " hours, ") : ""
  const mDisplay = m > 0 ? m + (m == 1 ? " minute, " : " minutes, ") : ""
  const sDisplay = s > 0 ? s + (s == 1 ? " second" : " seconds") : ""
  return dDisplay + hDisplay + mDisplay + sDisplay
}

const clockString = (ms) => {
  const h = isNaN(ms) ? "--" : Math.floor(ms / 3600000)
  const m = isNaN(ms) ? "--" : Math.floor(ms / 60000) % 60
  const s = isNaN(ms) ? "--" : Math.floor(ms / 1000) % 60
  return [h, m, s].map((v) => v.toString().padStart(2, 0)).join(":")
}

function log(level, message, data = "") {
  const timestamp = new Date().toLocaleString()
  const levelColors = {
    INFO: colors.cyan,
    SUCCESS: colors.green,
    WARNING: colors.yellow,
    ERROR: colors.red,
    HEADER: colors.magenta,
  }

  const color = levelColors[level] || colors.white
  console.log(`${color}[${level}]${colors.reset} ${colors.dim}${timestamp}${colors.reset} ${message}`, data)
}

console.log(`\n${colors.bright}${colors.cyan}=====================================${colors.reset}`)
console.log(`${colors.bright}${colors.cyan}         KYAKUYA BOT STARTED        ${colors.reset}`)
console.log(`${colors.bright}${colors.cyan}=====================================${colors.reset}\n`)

const PLUGINS_DIR = path.resolve(__dirname, "./plugins")

const pluginsLoader = async (directory) => {
  const plugins = []
  const files = fs.readdirSync(directory)
  for (const file of files) {
    const filePath = path.join(directory, file)
    if (filePath.endsWith(".js")) {
      try {
        const fileUrl = pathToFileURL(filePath).href
        delete require.cache[fileUrl]
        const pluginModule = await import(fileUrl + `?update=${Date.now()}`)
        const pluginHandler = pluginModule.default

        if (typeof pluginHandler === "function" && pluginHandler.command) {
          plugins.push(pluginHandler)
        } else {
          log("ERROR", `Plugin ${filePath} does not have expected structure`)
        }
      } catch (error) {
        log("ERROR", `Failed to load plugin ${filePath}:`, error)
      }
    }
  }
  return plugins
}

const setupMessageHandler = (sock, loadedPlugins) => {
  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type === "notify") {
      const botNumber = sock.user.id.replace(/:[0-9]+/, "")

      for (const msg of messages) {
        if (msg.key.fromMe || !msg.message) {
          continue
        }

        log("HEADER", "=== NEW MESSAGE ===")

        const senderJid = msg.key.remoteJid
        const isGroup = senderJid.endsWith("@g.us")
        const messageType = getMessageType(msg.message)
        const quoted = msg.message.extendedTextMessage?.contextInfo?.quotedMessage || null

        const groupMetadata = isGroup ? await sock.groupMetadata(senderJid).catch(() => ({})) : {}
        const groupName = isGroup ? groupMetadata.subject || "" : ""
        const participants = isGroup ? groupMetadata.participants || [] : []
        const groupAdmins = participants.filter((p) => p.admin === "admin" || p.admin === "superadmin").map((p) => p.id)
        const isBotAdmins = isGroup ? groupAdmins.includes(botNumber) : false
        const isAdmins = isGroup ? groupAdmins.includes(msg.key.participant || msg.key.remoteJid) : false

        let messageBody = ""
        if (msg.message.conversation) {
          messageBody = msg.message.conversation
        } else if (msg.message.extendedTextMessage?.text) {
          messageBody = msg.message.extendedTextMessage.text
        } else if (msg.message.imageMessage?.caption) {
          messageBody = msg.message.imageMessage.caption
        } else if (msg.message.videoMessage?.caption) {
          messageBody = msg.message.videoMessage.caption
        } else if (msg.message.stickerMessage) {
          continue
        }

        log("INFO", `From: ${senderJid}${isGroup ? ` (Group: ${groupName})` : ""}`)
        log("INFO", `Message: ${messageBody}`)

        let command = ""
        let args = ""
        const prefix = globalConfig.prefix

        if (messageBody.toLowerCase().trim().startsWith(prefix)) {
          const contentWithoutPrefix = messageBody.toLowerCase().trim().slice(prefix.length).trim()
          const parts = contentWithoutPrefix.split(" ")
          command = parts[0]
          args = parts.slice(1).join(" ")
          log("INFO", `Command detected: ${command} | Args: ${args}`)
        } else {
          log("INFO", "No command detected")
          continue
        }

        msg.reply = async (text) => {
          return await sock.sendMessage(senderJid, { text }, { quoted: msg })
        }

        msg.download = async (filename) => {
          return await downloadMedia(msg, filename)
        }

        const pluginContext = {
          sock,
          command: command,
          text: messageBody,
          args: args,
          isBot: msg.key.fromMe,
          m: msg,
          config: globalConfig,
          isGroup: isGroup,
          client: sock,
          groupMetadata,
          groupName,
          participants,
          groupAdmins,
          isBotAdmins,
          isAdmins,
          botNumber,
          messageType,
          quoted,
          mime: getMimeType,
          isImage,
          isVideo,
          isAudio,
          isDocument,
          downloadMedia,
          getMessageType,
          formatFileSize,
          generateFileName,
          getRandom,
          sleep,
          isUrl,
          runtime,
          clockString,
        }

        let commandHandled = false

        for (const pluginHandler of loadedPlugins) {
          if (typeof pluginHandler === "function" && pluginHandler.command) {
            const commandsToMatch = Array.isArray(pluginHandler.command)
              ? pluginHandler.command
              : [pluginHandler.command]

            const foundCommand = commandsToMatch.find((cmd) => cmd === command)
            if (foundCommand) {
              log("INFO", `Executing command: ${foundCommand}`)

              if (pluginHandler.group && !isGroup) {
                await sock.sendMessage(senderJid, { text: globalConfig.mess.ingroup }, { quoted: msg })
                log("WARNING", `Command "${foundCommand}" is group only. Rejected.`)
                commandHandled = true
                break
              }

              if (pluginHandler.private && isGroup) {
                await sock.sendMessage(senderJid, { text: globalConfig.mess.privateChat }, { quoted: msg })
                log("WARNING", `Command "${foundCommand}" is private only. Rejected.`)
                commandHandled = true
                break
              }

              try {
                await pluginHandler(msg, pluginContext)
                commandHandled = true
                log("SUCCESS", `Command "${foundCommand}" executed successfully`)
                break
              } catch (error) {
                log("ERROR", `Failed to execute command "${foundCommand}":`, error)
                await sock.sendMessage(
                  senderJid,
                  { text: `Error executing command "${foundCommand}". Please try again later.` },
                  { quoted: msg },
                )
              }
            }
          }
        }

        if (!commandHandled) {
          log("WARNING", `Command "${command}" not found`)
        }
      }
    }
  })
}

const handleConnection = (sock, connectToWhatsApp, saveCreds) => {
  let qrDisplayed = false

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update

    if (qr && loginMethod === "qr" && !qrDisplayed) {
      log("INFO", "QR Code generated. Scan with WhatsApp:")
      qrcode.generate(qr, { small: true })
      qrDisplayed = true
    }

    if (connection === "close") {
      qrDisplayed = false
      const shouldReconnect = (lastDisconnect?.error instanceof Boom)?.output?.statusCode !== DisconnectReason.loggedOut

      if (lastDisconnect?.error instanceof Boom) {
        const statusCode = lastDisconnect.error.output?.statusCode
        const errorData = lastDisconnect.error.data

        log("WARNING", `Connection closed with status: ${statusCode}`)

        if (statusCode === 401 || errorData?.reason === "401") {
          log("ERROR", "Authentication failed (401 Unauthorized)")
          log("INFO", "Clearing corrupted session files...")

          try {
            if (fs.existsSync("./session")) {
              fs.rmSync("./session", { recursive: true, force: true })
              log("SUCCESS", "Session files cleared")
            }
            if (fs.existsSync("./login.json")) {
              fs.unlinkSync("./login.json")
              log("SUCCESS", "Login method reset")
            }
          } catch (error) {
            log("ERROR", "Failed to clear session files:", error)
          }

          log("INFO", "Please restart the bot to authenticate again")
          process.exit(1)
        }

        if (statusCode === 515) {
          log("WARNING", "Stream error detected (515) - WhatsApp server issue")
          log("INFO", "This is normal, reconnecting automatically...")
          setTimeout(() => {
            connectToWhatsApp()
          }, 3000)
          return
        }

        if (statusCode === 428) {
          log("ERROR", "Connection rejected by WhatsApp (428)")
          log("INFO", "Please wait a few minutes before trying again")
          setTimeout(() => {
            log("INFO", "Retrying connection...")
            connectToWhatsApp()
          }, 30000)
          return
        }

        if (statusCode === 408) {
          log("WARNING", "Connection timeout (408)")
          log("INFO", "Retrying with fresh connection...")
          setTimeout(() => {
            connectToWhatsApp()
          }, 5000)
          return
        }

        if (statusCode === 440) {
          log("WARNING", "Session expired (440)")
          log("INFO", "Clearing session and restarting...")
          try {
            if (fs.existsSync("./session")) {
              fs.rmSync("./session", { recursive: true, force: true })
            }
          } catch (error) {
            log("ERROR", "Failed to clear session:", error)
          }
          setTimeout(() => {
            connectToWhatsApp()
          }, 5000)
          return
        }
      }

      log("WARNING", "Connection closed due to", lastDisconnect?.error)
      if (shouldReconnect) {
        log("INFO", "Reconnecting in 5 seconds...")
        setTimeout(() => {
          connectToWhatsApp()
        }, 5000)
      }
    } else if (connection === "open") {
      qrDisplayed = false
      log("SUCCESS", "Connected to WhatsApp successfully!")
      log("INFO", `Bot Name: ${globalConfig.botName}`)
      log("INFO", `Owner: ${globalConfig.ownerName}`)
    }
  })

  sock.ev.on("creds.update", saveCreds)
}

const askLoginMethod = () => {
  return new Promise((resolve) => {
    if (fs.existsSync("./login.json")) {
      try {
        const savedData = JSON.parse(fs.readFileSync("./login.json", "utf8"))
        if (savedData.method === "qr" || savedData.method === "pairing") {
          loginMethod = savedData.method
          log("SUCCESS", `Using saved login method: ${loginMethod.toUpperCase()}`)
          resolve()
          return
        }
      } catch (error) {
        log("WARNING", "Failed to read login.json, asking for method selection")
      }
    }

    rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    console.log(`\n${colors.bright}${colors.cyan}╔════════════════════════════════════╗${colors.reset}`)
    console.log(`${colors.bright}${colors.cyan}║        SELECT LOGIN METHOD         ║${colors.reset}`)
    console.log(`${colors.bright}${colors.cyan}╚════════════════════════════════════╝${colors.reset}\n`)

    console.log(`${colors.green}[1]${colors.reset} ${colors.bright}QR Code${colors.reset}     - Scan QR with WhatsApp`)
    console.log(`${colors.green}[2]${colors.reset} ${colors.bright}Pairing Code${colors.reset} - Enter phone number\n`)

    const askChoice = () => {
      rl.question(`${colors.yellow}Choose option (1 or 2): ${colors.reset}`, (answer) => {
        if (answer === "1") {
          loginMethod = "qr"
          console.log(`\n${colors.green}✓ Selected: QR Code method${colors.reset}`)
        } else if (answer === "2") {
          loginMethod = "pairing"
          console.log(`\n${colors.green}✓ Selected: Pairing Code method${colors.reset}`)
        } else {
          console.log(`${colors.red}✗ Invalid choice! Please enter 1 or 2${colors.reset}\n`)
          askChoice()
          return
        }

        const loginData = {
          method: loginMethod,
          timestamp: new Date().toISOString(),
        }
        fs.writeFileSync("./login.json", JSON.stringify(loginData, null, 2))
        log("SUCCESS", "Login method saved for future use")
        console.log(`${colors.dim}Note: This choice will be remembered for next startup${colors.reset}\n`)

        rl.close()
        rl = null
        resolve()
      })
    }

    askChoice()
  })
}

async function connectToWhatsApp() {
  if (currentSock) {
    try {
      if (currentSock && typeof currentSock.end === "function") {
        await currentSock.end()
      }
    } catch (error) {
      log("ERROR", "Failed to close previous connection:", error)
    }
    currentSock = null
  }

  let authState
  let saveCreds

  try {
    const authResult = await createAuthState("session")
    authState = authResult.state
    saveCreds = authResult.saveCreds
  } catch (error) {
    log("ERROR", "Failed to create auth state:", error)
    log("INFO", "Clearing corrupted session and retrying...")

    if (fs.existsSync("./session")) {
      fs.rmSync("./session", { recursive: true, force: true })
    }

    const authResult = await createAuthState("session")
    authState = authResult.state
    saveCreds = authResult.saveCreds
  }

  const sock = makeWASocket({
    logger: P({ level: "silent" }),
    printQRInTerminal: false,
    auth: authState,
    browser: Browsers.ubuntu("Chrome"),
    msgRetryCounterMap: {},
    retryRequestDelayMs: 500,
    markOnlineOnConnect: false,
    emitOwnEvents: true,
    generateHighQualityLinkPreview: true,
    connectTimeoutMs: 90000,
    defaultQueryTimeoutMs: 90000,
    keepAliveIntervalMs: 25000,
    maxMsgRetryCount: 3,
    getMessage: async (key) => {
      return { conversation: "Hello" }
    },
    patchMessageBeforeSending: (msg) => {
      if (msg.contextInfo) delete msg.contextInfo.mentionedJid
      return msg
    },
  })

  currentSock = sock

  if (loginMethod === "pairing" && !sock.authState.creds.registered) {
    console.log(`\n${colors.cyan}╔════════════════════════════════════╗${colors.reset}`)
    console.log(`${colors.cyan}║         PAIRING CODE LOGIN         ║${colors.reset}`)
    console.log(`${colors.cyan}╚════════════════════════════════════╝${colors.reset}\n`)

    const pairingRl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    })

    const askPhoneNumber = () => {
      return new Promise((resolve) => {
        pairingRl.question(
          `${colors.yellow}Enter WhatsApp number (with country code): ${colors.reset}`,
          async (phoneNumber) => {
            let cleanNumber = phoneNumber.replace(/[^0-9]/g, "")

            if (!cleanNumber.startsWith("62") && cleanNumber.startsWith("0")) {
              cleanNumber = "62" + cleanNumber.substring(1)
            }

            if (cleanNumber.length < 10 || cleanNumber.length > 15) {
              console.log(
                `${colors.red}✗ Invalid number! Please include country code (e.g., 6283822021601)${colors.reset}\n`,
              )
              resolve(askPhoneNumber())
              return
            }

            console.log(`${colors.yellow}Generating pairing code for ${cleanNumber}...${colors.reset}`)
            await new Promise((resolve) => setTimeout(resolve, 5000))

            try {
              const code = await sock.requestPairingCode(cleanNumber)
              const formattedCode = code.match(/.{1,4}/g)?.join("-") || code
              console.log(`\n${colors.green}✓ Pairing code generated successfully!${colors.reset}`)
              console.log(`${colors.bright}${colors.yellow}Your pairing code: ${formattedCode}${colors.reset}`)
              console.log(`${colors.dim}Enter this code in WhatsApp > Linked Devices > Link a Device${colors.reset}`)
              console.log(`${colors.red}⚠️  Code expires in 20 seconds - enter it quickly!${colors.reset}\n`)
              pairingRl.close()
              resolve()
            } catch (error) {
              console.log(`${colors.red}✗ Failed to generate pairing code: ${error.message}${colors.reset}`)
              console.log(`${colors.yellow}Retrying in 10 seconds...${colors.reset}\n`)
              await new Promise((resolve) => setTimeout(resolve, 10000))
              resolve(askPhoneNumber())
            }
          },
        )
      })
    }

    await askPhoneNumber()
  }

  const loadedPlugins = await pluginsLoader(PLUGINS_DIR)
  log("INFO", `Loaded ${loadedPlugins.length} plugins from ${PLUGINS_DIR}`)

  setupMessageHandler(sock, loadedPlugins)
  handleConnection(sock, connectToWhatsApp, saveCreds)
}

let isWatchingPlugins = false

const startPluginWatcher = () => {
  if (isWatchingPlugins) return

  const files = fs.readdirSync(PLUGINS_DIR)
  log("INFO", `Watching ${files.length} plugin files in ${PLUGINS_DIR}`)

  files.forEach((file) => {
    if (file.endsWith(".js")) {
      const filePath = path.join(PLUGINS_DIR, file)
      watchFile(filePath, () => {
        unwatchFile(filePath)
        log("WARNING", `Plugin change detected: ${file}`)
        log("INFO", "Restarting bot...")
        connectToWhatsApp()
      })
    }
  })
  isWatchingPlugins = true
}

async function main() {
  await askLoginMethod()
  await connectToWhatsApp()
  startPluginWatcher()
}

main().catch(console.error)
