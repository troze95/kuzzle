/**
 * This class describes the normalized non-realtime response made to clients
 */
var
  should = require('should'),
  async = require('async'),
  winston = require('winston'),
  rewire = require('rewire'),
  uuid = require('node-uuid'),
  RequestObject = require.main.require('lib/api/core/models/requestObject'),
  ResponseObject = require.main.require('lib/api/core/models/responseObject'),
  BadRequestError = require.main.require('lib/api/core/errors/badRequestError'),
  ForbiddenError = require.main.require('lib/api/core/errors/forbiddenError'),
  NotFoundError = require.main.require('lib/api/core/errors/notFoundError'),
  InternalError = require.main.require('lib/api/core/errors/internalError'),
  ServiceUnavailableError = require.main.require('lib/api/core/errors/serviceUnavailableError');

describe('Test: responseObject', function () {
  var
    request = {
      action: 'fakeaction',
      controller: 'fakecontroller',
      collection: 'fakecollection',
      persist: 'maybe',
      requestId: 'fakerequestId',
      body: {_id: 'fakeid', foo: 'bar'}
    },
    errorItems = [
      { name: 'BadRequestError', type: BadRequestError, status: 400 },
      { name: 'ForbiddenError', type: ForbiddenError, status: 403 },
      { name: 'NotFoundError', type: NotFoundError, status: 404 },
      { name: 'InternalError', type: InternalError, status: 500 },
      { name: 'ServiceUnavailableError', type: ServiceUnavailableError, status: 503 }
    ],
    requestObject;

  beforeEach(function () {
    requestObject = new RequestObject(request, {}, 'foo');
  });

  it('should expose the necessary prototype functions', function () {
    var response = new ResponseObject(requestObject);

    should(response.toJson).not.be.undefined().and.be.a.Function();
    should(response.unserialize).not.be.undefined().and.be.a.Function();
    should(response.addBody).not.be.undefined().and.be.a.Function();
  });

  it('should initialize a valid response object out of a simple and valid request object', function () {
    var response = new ResponseObject(requestObject);

    should(response.error).be.null();
    should(response.status).be.exactly(200);
    should(response.protocol).be.exactly(requestObject.protocol);
    should(response.action).be.exactly(requestObject.action);
    should(response.collection).be.exactly(requestObject.collection);
    should(response.controller).be.exactly(requestObject.controller);
    should(response.requestId).be.exactly(requestObject.requestId);
    should(response.timestamp).be.exactly(requestObject.timestamp);
    should(response.data).match(requestObject.data);
  });

  it('should use the second argument as the main source if enough information is provided', function () {
    var response = new ResponseObject({}, request);

    should(response.error).be.null();
    should(response.status).be.exactly(200);
    should(response.protocol).be.null();
    should(response.action).be.exactly(request.action);
    should(response.collection).be.exactly(request.collection);
    should(response.controller).be.exactly(request.controller);
    should(response.requestId).be.exactly(request.requestId);
    should(response.timestamp).be.null();
    should(response.data).be.null();
  });

  async.each(errorItems, function(item, callback) {
    it('should initialize a ' + item.name + ' response if such an error is provided', function () {
      var
        error = new item.type('foobar'),
        response = new ResponseObject(requestObject, error);

        should(response.error.message).be.not.null();
        should(response.error.message).be.exactly(error.message);
        should(response.status).be.exactly(item.status);
        should(response.protocol).be.exactly(requestObject.protocol);
        should(response.action).be.exactly(requestObject.action);
        should(response.collection).be.exactly(requestObject.collection);
        should(response.controller).be.exactly(requestObject.controller);
        should(response.requestId).be.exactly(requestObject.requestId);
        should(response.timestamp).be.exactly(requestObject.timestamp);
        should(response.data).match(requestObject.data);
    });
  });

  it('should return a normalized version of itself when toJson is invoked', function () {
    var
      error = new Error('foobar'),
      response = new ResponseObject(requestObject, error),
      serialized = response.toJson();

    should(Object.keys(serialized).length).be.exactly(3);
    should(serialized.status).be.exactly(500);
    should(serialized.error.message).be.exactly(error.message);
    should(serialized.result.protocol).be.undefined();
    should(serialized.result.action).be.exactly(requestObject.action);
    should(serialized.result.collection).be.exactly(requestObject.collection);
    should(serialized.result.controller).be.exactly(requestObject.controller);
    should(serialized.result.requestId).be.exactly(requestObject.requestId);
    should(serialized.result.timestamp).be.undefined();
    should(serialized.result._id).be.exactly(requestObject.data._id);
    should(serialized.result._source).match(requestObject.data.body);
  });

  it('should not expose blacklisted data members in its main result section', function () {
    var
      response = new ResponseObject(requestObject),
      serialized = response.toJson(['_id']);

    should(serialized.result._id).be.undefined();
    should(serialized.result._source).match(requestObject.data.body);
  });

  it('should return an error-only response if it contains no data', function () {
    var
      error = new Error('foobar'),
      response,
      serialized;

    delete requestObject.data;
    response = new ResponseObject(requestObject, error);
    serialized = response.toJson();

    should(serialized.result).be.null();
    should(serialized.status).be.exactly(500);
    should(serialized.error.message).be.exactly(error.message);
  });

  it('should be able to reconstruct a response object out of a serialized version of itself', function () {
    var
      response = new ResponseObject(requestObject),
      serialized = JSON.parse(JSON.stringify(response)),
      unserialized = ResponseObject.prototype.unserialize(serialized);

    should(unserialized).match(response);
    should(unserialized.toJson).not.be.undefined().and.be.a.Function();
    should(unserialized.unserialize).not.be.undefined().and.be.a.Function();
    should(unserialized.addBody).not.be.undefined().and.be.a.Function();
  });

  it('should replicate data._source into data.body when addBody is invoked', function () {
    var response = new ResponseObject(requestObject);

    response.data._source = response.data.body;
    delete response.data.body;

    response.addBody();

    should(response.data._source).not.be.undefined();
    should(response.data.body).match(response.data._source);
  });
});