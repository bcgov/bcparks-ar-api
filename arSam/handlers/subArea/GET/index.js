// TODO: Decouple subArea get from park get endpoint.
const { logger, sendResponse } = require("/opt/baseLayer");

exports.handler = async (event, context) => {
  logger.debug("Subarea get:", event);

  if (event.httpMethod === 'OPTIONS') {
    return sendResponse(200, {}, context);
  }

  return sendResponse(501, { msg: "Error: Not implemented." }, context);
};
