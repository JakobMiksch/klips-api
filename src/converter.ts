import { logger } from './logger';
import dayjs from 'dayjs';
import path from 'path';
import { GeoTiffPublicationJobOptions } from './types';

/**
 * Convert incoming message from API to an internal job for RabbitMQ.
 *
 * @param requestBody {Object} The JSON coming from the API
 * @param options {GeoTiffPublicationJobOptions} An object with options for the job creation
 *
 * @returns {Object} The job for the dispatcher
 */
const createGeoTiffPublicationJob = (requestBody: any,
  options: GeoTiffPublicationJobOptions
) => {
  const {
    minTimeStamp, maxTimeStamp, timeStampFormat, regions, types, scenarios
  }: GeoTiffPublicationJobOptions
    = options;

  const type: string = requestBody.payload.type;

  if (!type || !types.includes(type)) {
    throw 'Provided type is not known.';
  }

  const scenario: string = requestBody.payload.scenario;

  if (!scenario || !scenarios.includes(scenario)) {
    throw 'Provided scenario is not known.';
  }

  const regionName: string = requestBody.payload.region;

  if (!regionName || !regions.includes(regionName)) {
    throw 'Provided region is not known.';
  }
  const geoServerWorkspace = regionName;
  // NOTE: the store name must be unique, even between multiple workspaces
  const mosaicStoreName = `${regionName}_temperature`;

  const geotiffUrl = requestBody.payload.url;

  const parsedTimeStamp = dayjs(requestBody.payload.predictionStartTime);
  if (!parsedTimeStamp.isValid()) {
    throw 'TimeStamp not valid';
  }

  const inCorrectTimeRange = parsedTimeStamp.isAfter(minTimeStamp) && parsedTimeStamp.isBefore(maxTimeStamp);
  if (!inCorrectTimeRange) {
    throw 'Time outside of timerange';
  }

  // TODO: use ISO8601 as format
  const timestamp = parsedTimeStamp.format(timeStampFormat);

  const filename = `${requestBody.payload.region}_${timestamp}`;

  const geoserverDataDir: string = process.env.GEOSERVER_DATA_DIR as string;
  if (!geoserverDataDir) {
    throw 'GeoServer data directory not provided';
  }
  const geoTiffFilePath = path.join(geoserverDataDir, 'temp', 'klips_geotiff_files', `${filename}.tif`);

  const email = requestBody.email;

  // set username and password if necessary
  let username;
  let password;
  const partnerUrlStart = process.env.PARTNER_URL_START;
  if (geotiffUrl.startsWith(partnerUrlStart)) {
    logger.info('URL from partner is used');
    username = process.env.PARTNER_API_USERNAME;
    password = process.env.PARTNER_API_PASSWORD;
  }

  return {
    job: [
      {
        id: 1,
        type: 'download-file',
        inputs: [
          geotiffUrl,
          geoTiffFilePath,
          username,
          password
        ]
      },
      {
        id: 2,
        type: 'geotiff-validator',
        inputs: [
          {
            outputOfId: 1,
            outputIndex: 0
          }
        ]
      },
      {
        id: 3,
        type: 'geoserver-create-imagemosaic-datastore',
        inputs: [
          geoServerWorkspace,
          mosaicStoreName,
          {
            outputOfId: 2,
            outputIndex: 0
          }
        ]
      },
      {
        id: 4,
        type: 'geoserver-publish-imagemosaic',
        inputs: [
          geoServerWorkspace,
          mosaicStoreName,
          {
            outputOfId: 2,
            outputIndex: 0
          }
        ]
      }
    ],
    email: email
  };
};

/**
 * Creates different jobs depending on the input message.
 *
 * @param requestBody {Object} The JSON coming from the API
 * @param jobConfig {Object} The options for the jobs
 *
 * @returns {Object} The job for the dispatcher
 */
const createJobFromApiInput = (requestBody: any, jobConfig: any) => {
  const geoTiffPublicationJob = jobConfig.geoTiffPublicationJob;

  return createGeoTiffPublicationJob(requestBody, geoTiffPublicationJob);
};

export default createJobFromApiInput;
