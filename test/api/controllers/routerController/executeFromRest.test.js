/*
 * This file tests the executeFromRest function, which transmit requests and responses
 * between clients and the funnel controller
 */

var
  should = require('should'),
  winston = require('winston'),
  params = require('rc')('kuzzle'),
  q = require('q'),
  Kuzzle = require.main.require('lib/api/Kuzzle'),
  rewire = require('rewire'),
  RouterController = rewire('../../../../lib/api/controllers/routerController'),
  RequestObject = require.main.require('lib/api/core/models/requestObject'),
  ResponseObject = require.main.require('lib/api/core/models/responseObject');

require('should-promised');

describe('Test: routerController.executeFromRest', function () {
  var
    kuzzle,
    mockupResponse = {
      ended: false,
      statusCode: 0,
      header: {},
      response: {},
      init: function () { this.ended = false; this.statusCode = 0; this.response = {}; this.header = ''; },
      writeHead: function (status, header) { this.statusCode = status; this.header = header; },
      end: function (message) { this.ended = true; this.response = JSON.parse(message); }
    },
    executeFromRest;

  before(function (done) {
    var
      mockupFunnel = function (requestObject) {
        var
          deferred = q.defer(),
          forwardedObject = new ResponseObject(requestObject, {});

        if (requestObject.data.body.resolve) {
          if (requestObject.data.body.empty) {
            deferred.resolve({});
          }
          else {
            deferred.resolve(forwardedObject);
          }
        }
        else {
          deferred.reject(new Error('rejected'));
        }

        return deferred.promise;
      },
      mockupRouterListener = {
        listener: {
          add: function () { return true; }
        }
      };

    kuzzle = new Kuzzle();
    kuzzle.log = new (winston.Logger)({transports: [new (winston.transports.Console)({level: 'silent'})]});

    kuzzle.start(params, {dummy: true})
      .then(function () {
        kuzzle.funnel.execute = mockupFunnel;
        RouterController.router = mockupRouterListener;

        executeFromRest = RouterController.__get__('executeFromRest');
        done();
      });
  });

  it('should reject requests when the controller is not provided', function () {
    var params = { action: 'create', collection: 'foobar' };

    mockupResponse.init();
    executeFromRest.call(kuzzle, params, {headers: {'content-type': 'application/json'}}, mockupResponse);

    should(mockupResponse.statusCode).be.exactly(400);
    should(mockupResponse.header['Content-Type']).not.be.undefined();
    should(mockupResponse.header['Content-Type']).be.exactly('application/json');
    should(mockupResponse.response.result).be.null();
    should(mockupResponse.response.status).be.exactly(400);
    should(mockupResponse.response.error).not.be.null();
    should(mockupResponse.response.error.message).not.be.null();
    should(mockupResponse.response.error.message).be.exactly('The "controller" argument is missing');
  });

  it('should reject requests when the content-type is not application/json', function () {
    var
      params = { action: 'create', controller: 'write' },
      data = {_body: true, headers: {'content-type': '"application/x-www-form-urlencoded'}, body: {resolve: true}, params: {collection: 'foobar'}};

    mockupResponse.init();
    executeFromRest.call(kuzzle, params, data, mockupResponse);
    should(mockupResponse.statusCode).be.exactly(400);
    should(mockupResponse.header['Content-Type']).not.be.undefined();
    should(mockupResponse.header['Content-Type']).be.exactly('application/json');
    should(mockupResponse.response.result).be.null();
    should(mockupResponse.response.status).be.exactly(400);
    should(mockupResponse.response.error).not.be.null();
    should(mockupResponse.response.error.message).not.be.null();
    should(mockupResponse.response.error.message).startWith('Invalid request content-type');
  });

  it('should respond with a HTTP 200 message in case of success', function (done) {
    var
      params = { action: 'create', controller: 'write' },
      data = {headers: {'content-type': 'application/json'}, body: {resolve: true}, params: {collection: 'foobar'}};

    mockupResponse.init();
    executeFromRest.call(kuzzle, params, data, mockupResponse);

    setTimeout(function () {
      try {
        should(mockupResponse.statusCode).be.exactly(200);
        should(mockupResponse.header['Content-Type']).not.be.undefined();
        should(mockupResponse.header['Content-Type']).be.exactly('application/json');
        should(mockupResponse.response.status).be.exactly(200);
        should(mockupResponse.response.error).be.null();
        should(mockupResponse.response.result).be.not.null();
        should(mockupResponse.response.result._source).match(data.body);
        should(mockupResponse.response.result.action).be.exactly('create');
        should(mockupResponse.response.result.controller).be.exactly('write');
        done();
      }
      catch (e) {
        done(e);
      }
    }, 20);
  });

  it('should not respond if the response is empty', function (done) {
    var
      params = { action: 'create', controller: 'write' },
      data = {headers: {'content-type': 'application/json'}, body: {resolve: true, empty: true}, params: {collection: 'foobar'}};

    mockupResponse.init();
    executeFromRest.call(kuzzle, params, data, mockupResponse);

    setTimeout(function () {
      try {
        should(mockupResponse.ended).be.false();
        done();
      }
      catch (e) {
        done(e);
      }
    }, 20);
  });

  it('should respond with a HTTP 500 message in case of error', function (done) {
    var
      params = { action: 'create', controller: 'write' },
      data = {headers: {'content-type': 'application/json'}, body: {resolve: false}, params: {collection: 'foobar'}};

    mockupResponse.init();
    executeFromRest.call(kuzzle, params, data, mockupResponse);

    setTimeout(function () {
      try {
        should(mockupResponse.statusCode).be.exactly(500);
        should(mockupResponse.header['Content-Type']).not.be.undefined();
        should(mockupResponse.header['Content-Type']).be.exactly('application/json');
        should(mockupResponse.response.status).be.exactly(500);
        should(mockupResponse.response.error).not.be.null();
        should(mockupResponse.response.error.message).not.be.null();
        should(mockupResponse.response.error.message).be.exactly('rejected');
        should(mockupResponse.response.result).be.null();
        done();
      }
      catch (e) {
        done(e);
      }
    }, 20);
  });

  it('should use the request content instead of the metadata to complete missing information', function (done) {
    var
      params = {controller: 'write' },
      data = {headers: {'content-type': 'application/json'}, body: {resolve: true}, params: {collection: 'foobar',  action: 'create'}};

    mockupResponse.init();
    executeFromRest.call(kuzzle, params, data, mockupResponse);

    setTimeout(function () {
      try {
        should(mockupResponse.statusCode).be.exactly(200);
        should(mockupResponse.header['Content-Type']).not.be.undefined();
        should(mockupResponse.header['Content-Type']).be.exactly('application/json');
        should(mockupResponse.response.status).be.exactly(200);
        should(mockupResponse.response.error).be.null();
        should(mockupResponse.response.result).be.not.null();
        should(mockupResponse.response.result.action).be.exactly('create');
        should(mockupResponse.response.result.controller).be.exactly('write');
        done();
      }
      catch (e) {
        done(e);
      }
    }, 20);
  });

  it('should copy any found "id" identifier', function (done) {
    var
      params = {controller: 'write' },
      data = {headers: {'content-type': 'application/json'}, body: {resolve: true}, params: {collection: 'foobar',  action: 'create', id: 'fakeid'}};

    mockupResponse.init();
    executeFromRest.call(kuzzle, params, data, mockupResponse);

    setTimeout(function () {
      try {
        should(mockupResponse.statusCode).be.exactly(200);
        should(mockupResponse.header['Content-Type']).not.be.undefined();
        should(mockupResponse.header['Content-Type']).be.exactly('application/json');
        should(mockupResponse.response.status).be.exactly(200);
        should(mockupResponse.response.error).be.null();
        should(mockupResponse.response.result).be.not.null();
        should(mockupResponse.response.result.action).be.exactly('create');
        should(mockupResponse.response.result.controller).be.exactly('write');
        should(mockupResponse.response.result._id).be.exactly('fakeid');
        done();
      }
      catch (e) {
        done(e);
      }
    }, 20);
  });
});