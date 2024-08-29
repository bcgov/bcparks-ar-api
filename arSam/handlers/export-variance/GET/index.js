const bucket = process.env.S3_BUCKET_DATA || 'parks-ar-assets-tools';

const IS_OFFLINE = process.env.IS_OFFLINE && process.env.IS_OFFLINE === 'true' ? true : false;

const options = {};
if (IS_OFFLINE) {
  options.region = 'local';
  // For local we use port 3002 because we're hitting an invokable
  options.endpoint = 'http://localhost:3002';
}

const {
  dynamoClient,
  exportPutObj,
  getOne,
  GetObjectCommand,
  getSignedUrl,
  lambda,
  logger,
  marshall,
  PutItemCommand,
  runQuery,
  s3Client,
  sendResponse,
  TABLE_NAME
} = require('/opt/baseLayer');
const { createHash } = require('node:crypto');

const VARIANCE_EXPORT_FUNCTION_NAME =
  process.env.VARIANCE_EXPORT_FUNCTION_NAME || 'ar-api-VarianceExportInvokableFunction';

const EXPIRY_TIME = process.env.EXPORT_EXPIRY_TIME ? Number(process.env.EXPORT_EXPIRY_TIME) : 60 * 15; // 15 minutes

exports.handler = async (event, context) => {
  logger.info('GET: Export variances - ', event?.queryStringParameters);

  // Allow CORS
  if (event.httpMethod === 'OPTIONS') {
    return sendResponse(200, {}, context);
  }

  try {
    let permissionObject = event.requestContext.authorizer;
    permissionObject.roles = JSON.parse(permissionObject?.roles);
    permissionObject.isAdmin = JSON.parse(permissionObject?.isAdmin || false);
    permissionObject.isAuthenticated = JSON.parse(permissionObject?.isAuthenticated || false);

    if (!permissionObject.isAuthenticated) {
      return sendResponse(403, { msg: 'Error: Not authenticated' }, context);
    }
    let params = event?.queryStringParameters || {};
    params['roles'] = permissionObject.roles;

    // Must provide fiscal year end
    if (!params?.fiscalYearEnd) {
      return sendResponse(400, { msg: 'No fiscal year end provided.' }, context);
    }
    // generate a job id from params+role
    let hashParams = { ...params };
        
    delete hashParams.getJob;
    const decodedHash = JSON.stringify(hashParams) + JSON.stringify(permissionObject.roles);
    const hash = createHash('md5').update(decodedHash).digest('hex');
    const pk = 'variance-exp-job';

    const res = await getOne(pk, hash);

    if (params?.getJob) {
      // We're trying to download an existing job

      if (!res) {
        // Job doesn't exist.
        return sendResponse(200, { msg: 'Requested job does not exist' }, context);
      } else if (res.progressState === 'complete' || res.progressState === 'error') {
        // Job is not currently running. Return signed URL
        let urlKey = res.key;
        let message = 'Job completed';
        if (res.progressState === 'error') {
          urlKey = res.lastSuccessfulJob.key || {};
          message = 'Job failed. Returning last successful job.';
        }
        let URL = '';
        if (!IS_OFFLINE) {
          logger.debug('S3_BUCKET_DATA:', bucket);
          logger.debug('Url key:', urlKey);
          let command = new GetObjectCommand({ Bucket: bucket, Key: urlKey });
          URL = await getSignedUrl(s3Client, command, { expiresIn: EXPIRY_TIME });
        }
        // send back new job object
        delete res.pk;
        delete res.sk;
        delete res.key;
        return sendResponse(200, { msg: message, signedURL: URL, jobObj: res }, context);
      } else {
        // Job is currently running. Return latest job object
        delete res?.pk;
        delete res?.sk;
        delete res?.key;
        return sendResponse(200, { msg: 'Job is currently running', jobObj: res }, context);
      }
    } else {
      // We are trying to generate a new report
      // If there's already a completed job, we want to save this in case the new job fails
      let lastSuccessfulJob = {};
      if (res?.progressState === 'complete' && res?.key) {
        lastSuccessfulJob = {
          key: res?.key,
          dateGenerated: res?.dateGenerated || new Date().toISOString()
        };
      } else if (res?.progressState === 'error') {
        lastSuccessfulJob = res?.lastSuccessfulJob || {};
      }
      // create the new job object
      const varianceExportPutObj = exportPutObj(pk, hash, params, lastSuccessfulJob)

      logger.debug('Creating new job:', varianceExportPutObj);
      let newJob;
      try {
        newJob = await dynamoClient.send(new PutItemCommand(varianceExportPutObj));
        // Check if there's already a report being generated.
        // If there are is no instance of a job or the job is 100% complete, generate a report.
        logger.debug('New job created:', newJob);

        // run the export function
        const varianceExportParams = {
          FunctionName: VARIANCE_EXPORT_FUNCTION_NAME,
          InvocationType: 'Event',
          LogType: 'None',
          Payload: JSON.stringify({
            jobId: hash,
            params: params,
            lastSuccessfulJob: lastSuccessfulJob
          }),
        };
        // Invoke the variance report export lambda
        await lambda.invoke(varianceExportParams);

        return sendResponse(200, { msg: 'Variance report export job created' }, context);
      } catch (error) {
        // a job already exists
        logger.error('Error creating new job:', error);
        return sendResponse(200, { msg: 'Variance report export job already running' }, context);
      }
    }
  } catch (error) {
    logger.error(error);
    return sendResponse(400, { error: error }, context);
  }
};
