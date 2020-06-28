const AWS = require('aws-sdk');
const dts = require('date-fns');
const uuid = require('uuid').v4;

const Env = require('../env');
const { keyValuesFromBlocks } = require('./textractUtils');

const s3 = new AWS.S3({
  params: {
    Bucket: Env.getAwsS3Bucket(),
  },
  credentials: {
    accessKeyId: Env.getAwsAccessKeyId(),
    secretAccessKey: Env.getAwsSecretAccessKey(),
  },
});

const upload = async (name, buffer) => {
  return new Promise((resolve, reject) => {
    s3.upload({
      ACL: 'public-read',
      Body: buffer,
      Expires: dts.addMinutes(new Date(), 15),
      Key: `${uuid()}_${name}`.replace(/\s/, '_'),
    }, (err, upload) => {
      if (err) return reject(err);
      resolve({
        bucket: upload.Bucket,
        expiration: upload.Expiration,
        location: upload.Location,
        key: upload.Key,
      });
    });
  });
}

const textract = new AWS.Textract({
  region: 'us-east-1',
  credentials: {
    accessKeyId: Env.getAwsAccessKeyId(),
    secretAccessKey: Env.getAwsSecretAccessKey(),
  },
});

const startDocumentAnalysis = async (config) => {
  return new Promise((resolve, reject) => {
    textract.startDocumentAnalysis({
      DocumentLocation: {
        S3Object: {
          Bucket: file.bucket,
          Name: file.key,
        }
      },
      FeatureTypes: ['FORMS'],
    }, (err, data) => {
      if (err) return reject(err);
      resolve(data.JobId);
    });
  });
}

const getDocumentAnalysis = async (textractJobId) => {
  return new Promise((resolve, reject) => {
    let intervalId;
    // Poll for textract job results...
    intervalId = setInterval(() => {
      textract.getDocumentAnalysis({ JobId: textractJobId }, (err, data) => {
        if (err) return reject(err);
        // If succeeded, return the key/value parsed data
        if (data.JobStatus === 'SUCCEEDED') {
          console.log('Job done!')
          const keyValues = keyValuesFromBlocks(data.Blocks);
          clearInterval(intervalId);
          resolve(keyValues);
        } else if (data.JobStatus === 'FAILED') {
          console.log('Job failed!', data)
          clearInterval(intervalId);
          reject(data);
        } else {
          console.log('Job in progress...', data)
        }
      });
    }, 1000);
  });
}

module.exports = {
  getDocumentAnalysis,
  s3,
  startDocumentAnalysis,
  textract,
  upload,
};