const { createLogger, format, transports } = require('winston');
const chalk = require('chalk').default;
require('winston-daily-rotate-file')
const { combine, colorize, label, printf, splat, timestamp } = format;
const {Writable} = require('stream')
const fs = require('fs')
const {logConfig,bucConfig} = require('../../../config/myConfig')
var COS = require('cos-nodejs-sdk-v5');
var cos = new COS({
  // 必选参数
  SecretId: bucConfig.SecretId,
  SecretKey: bucConfig.SecretKey,
  // 可选参数
  FileParallelLimit: bucConfig.FileParallelLimit,    // 控制文件上传并发数
  ChunkParallelLimit: bucConfig.ChunkParallelLimit,   // 控制单个文件下分片上传并发数，在同园区上传可以设置较大的并发数
  ChunkSize: bucConfig.ChunkSize,  // 控制分片大小，单位 B，在同园区上传可以设置较大的分片大小
});
// var testStream = fs.createWriteStream('./log/test.log')
var sumBuffer = []
var bufferTotalL = 0
const logOption = {
  maxBufferLength: logConfig.maxBufferLength,
  frequencyInterval: logConfig.frequencyInterval,
  flushTime: logConfig.flushTime
}

var stream = new Writable({
  objectMode: false,
  write: (raw, encoding ,writeCb) => {
    writeBuffer(raw)
    writeCb()
  }
})

var transport = new transports.DailyRotateFile({
  filename: logConfig.filename,
  datePattern: logConfig.datePattern,
  zippedArchive: logConfig.zippedArchive,
  maxSize: logConfig.maxSize,
  maxFiles: logConfig.maxFiles,
  frequency: logConfig.frequency
});

// 日志上传到腾讯云
transport.on('archive', function(zipFilename) {
  // var readerStream = fs.createReadStream(`./log/${oldFilename}`);
  // let fileName = zipFilename.substr(4, zipFilename.indexOf('/', 4) - 4)
  if (process.env.GATEWAY_ENV == 'pro') {
    cos.putObject({
      Bucket: bucConfig.Bucket, /* 必须 */
      Region: bucConfig.Region,     /* 存储桶所在地域，必须字段 */
      Key: zipFilename,              /* 必须 */
      StorageClass: bucConfig.StorageClass,
      Body: fs.createReadStream(`./${zipFilename}`), // 上传文件对象
      onProgress: function(progressData) {
        console.log('update log to bucket', JSON.stringify(progressData));
      }
    }, function(err, data) {
      console.log('update log to bucket err', err || data);
    });
  }
});

// transport.on('rotate', function(oldFilename, newFilename) {
//   // do something fun
//   // oldFilename = "2020-12-21.log.gz"
//   // console.log(oldFilename.substr(-1, 2))
//   console.log('-------rotate', oldFilename)
// });

const logFormat = (loggerLabel) => combine(
  timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  splat(),
  colorize(),
  label({ label: loggerLabel }),
  printf(info => `${info.timestamp} ${chalk.cyan(info.label)} ${info.level}: ${info.message}`)
);

const logFormatStream = (loggerLabel) => combine(
  timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  splat(),
  label({ label: loggerLabel }),
  printf(info => `${info.timestamp} ${info.label} ${info.level}: ${info.message}`)
);

const logFormat2 = () => combine(
  printf(info => `${info.message}`)
);

// 日志输出到流
const createLoggerWithLabel = (label) => createLogger({
  level: process.env.LOG_LEVEL || 'info',
  transports: [
    new transports.Console({
      format: logFormat(label)
    }),
    new transports.Stream({
      stream,
      format: logFormatStream(label)
    })
  ],
  // format: logFormat(label)
});

// 写入到文件
const createLoggerWriteFile = createLogger({
  level: 'info',
  transports: [
    transport
  ],
  format: logFormat2()
});

// 创建定时器
if (logOption.frequencyInterval) {
  createInterval()
}

// createLoggerWriteFile.on('finish', () => {
//   console.log('写入完成')
// })

module.exports = {
  gateway: createLoggerWithLabel('[EG:gateway]'),
  policy: createLoggerWithLabel('[EG:policy]'),
  config: createLoggerWithLabel('[EG:config]'),
  db: createLoggerWithLabel('[EG:db]'),
  admin: createLoggerWithLabel('[EG:admin]'),
  plugins: createLoggerWithLabel('[EG:plugins]'),
  createLoggerWithLabel
};

// var sumCount = 0
// 把流中的数据转换为buff
function writeBuffer(raw) {
  // sumCount ++
  let _buf = Buffer.from(raw)
  concatBuffer(_buf)
}

// 把buff拼接且判断是否达到阈值
function concatBuffer(buf) {
  bufferTotalL += buf.length
  sumBuffer.push(buf)
  if (sumBuffer.length >= logOption.maxBufferLength ) {
    flush()
  }
}

// 把buff中的数据写入文件
function flush() {
  if (sumBuffer.length > 0) {
    let _buf = Buffer.concat(sumBuffer,bufferTotalL - 1)
    createLoggerWriteFile.info(_buf.toString())
    sumBuffer = []
    bufferTotalL = 0
  }
}

// 创建定时任务
function createInterval () {
  return setInterval(() => flush(), logOption.flushTime)
}
