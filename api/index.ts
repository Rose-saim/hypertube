import * as Koa from 'koa'
import * as koaBody from 'koa-body'
import * as session from 'koa-session'
import * as mongoose from 'mongoose'
import * as passport from 'koa-passport'
import * as cors from '@koa/cors'
import * as serve from 'koa-static'
import * as mount from 'koa-mount'
import * as compress from 'koa-compress'
import * as rateLimit from 'koa-ratelimit'
import * as helmet from 'koa-helmet'
import * as logger from 'koa-logger'

import { errorMiddleware, handleStreamDisconnect } from './middlewares/error-handler'
import { checkOriginMiddleware } from './middlewares/check-origin'
import { clearCacheJob, clearOldMoviesJob } from './utils/cron'
import logs from './utils/logger'
import router from './routes'
import config from './config'
import './services/auth'

/*
 * Cron jobs
 */

clearCacheJob()
clearOldMoviesJob()

/*
 * API setup
 */

const app = new Koa()

// Security middleware
app.use(helmet())
app.use(rateLimit({
  driver: 'memory',
  db: new Map(),
  duration: 60000,
  max: 100,
  errorMessage: 'Too many requests, please try again later.'
}))

// Basic middleware
handleStreamDisconnect(app)
app.use(cors({ 
  credentials: true, 
  origin: checkOriginMiddleware,
  maxAge: 86400
}))
app.use(errorMiddleware)

// Body parsing with file upload limits
app.use(koaBody({
  multipart: true,
  formidable: {
    maxFileSize: 200 * 1024 * 1024, // 200mb
    keepExtensions: true
  },
  jsonLimit: '10mb'
}))

// Compression
app.use(compress({
  threshold: 2048,
  gzip: {
    flush: require('zlib').constants.Z_SYNC_FLUSH
  },
  deflate: {
    flush: require('zlib').constants.Z_SYNC_FLUSH,
  },
  br: false
}))

// Logging in development
if (process.env.NODE_ENV !== 'production') {
  app.use(logger());
}

/*
 * Authentication: An in memory session in created for each authenticated client.
 * The user data is saved locally, and a secure token matching this token is sent to the client using cookies.
 * To use multiple threads, the session instance could easily be configured using redis.
 */

// Session configuration
app.keys = [config.SESSION_SECRET]
app.use(session({
  key: 'hypertube:sess',
  maxAge: 86400000, // 1 day
  autoCommit: true,
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict'
}, app))

// Authentication
app.use(passport.initialize())
app.use(passport.session())

// Routes
app.use(router.routes()).use(router.allowedMethods())

// Static files with cache control
const staticOptions = {
  maxage: 86400000, // 1 day
  gzip: true
}
app.use(mount('/subtitles', serve('./public/subtitles', staticOptions)))
app.use(mount('/images', serve('./public/images', staticOptions)))

/*
 * Starting the API
 * - First we connect to the database
 * - Second the app listen on PORT
 */

const mongoOptions = {
  useNewUrlParser: true,
  user: config.MONGO_USER,
  pass: config.MONGO_PWD,
  useUnifiedTopology: true,
}

mongoose
  .connect(config.MONGO_URL, mongoOptions)
  .then(() => {
    app
      .listen(config.SERVER_PORT, () => {
        logs.info(`Server listening on port ${config.SERVER_PORT} 😊`)
      })
      .on('error', err => {
        logs.error(err.message)
        process.exit(1)
      })
  })
  .catch(err => {
    logs.error(err.message)
    process.exit(1)
  })
