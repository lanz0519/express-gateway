const logger = require('./instance');

module.exports = (params) =>
  (req, res, next) => {
    let message = params.message
    if (message === 'req') {
      message = `ip: ${req.ip}  hostname: ${req.hostname}  method: ${req.method}  url: ${req.url}\nheaders: ${JSON.stringify(req.headers)}`
    }
    try {
      logger.info(req.egContext.evaluateAsTemplateString(message));
    } catch (e) {
      logger.error(`failed to build log message: ${e.message}`);
    }
    next();
  };
