const { runQuery, TABLE_NAME, sendResponse, logger } = require('/opt/baseLayer');

exports.handler = async (event, context) => {
  logger.debug('Read Config', event);

  // Allow CORS
  if (event.httpMethod === 'OPTIONS') {
    return sendResponse(200, {}, 'Success', null, context);
  }

  let queryObj = {
    TableName: TABLE_NAME
  };

  try {
    queryObj.ExpressionAttributeValues = {};
    queryObj.ExpressionAttributeValues[':pk'] = { S: 'config' };
    queryObj.ExpressionAttributeValues[':sk'] = { S: 'config' };
    queryObj.KeyConditionExpression = 'pk =:pk AND sk =:sk';

    const configData = await runQuery(queryObj);
    logger.info('Read Config Returning.');
    return sendResponse(200, configData[0], context);
  } catch (err) {
    logger.error(err);
    return sendResponse(400, err, context);
  }
};
