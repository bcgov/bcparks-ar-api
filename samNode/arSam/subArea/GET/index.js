// TODO: Decouple subArea get from park get endpoint.
const { logger } = require("/opt/baseLayer");

exports.handler = async (event, context) => {
  logger.debug("Subarea get:", event);

  // Allow CORS
  if (event.httpMethod === 'OPTIONS') {
    return sendResponse(200, {}, 'Success', null, context);
  }
  
  return sendResponse(501, { msg: "Error: Not implemented." }, context);
};
   