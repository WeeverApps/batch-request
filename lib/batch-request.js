// Batch Request

var _                         = require('lodash'),
    validator                 = require('validator'),
    methods                   = require('methods'),
    Promise                   = require('bluebird'),
    request                   = require('request-promise'),
    url                       = require('url'),
    es6TemplateStringsResolve = require('es6-template-strings/resolve'),
    es6TemplateStringsCompile = require('es6-template-strings/compile'),
    streamifier               = require('streamifier'),
    stream                    = require('stream')
    ;

request.debug = true;

function debug() {
    var util = require('util');
    console.log( util.inspect( arguments, { depth: null, colors: true } ) );
    console.log( '' );
}

function getFinalUrl(req, r) {
    // Accept either uri or url (this is what request does, we just mirror)
    r.url = r.url || r.uri;

    // Convert relative paths to full paths
    if (typeof r.url === 'string' && /^\//.test(r.url) === true) {
        return req.protocol + '://' + req.get('host') + r.url;
    }

    return r.url;
}

/**
 *
 * @param {Object} [params]
 * @param {Boolean} [params.localOnly=true]
 * @param {Boolean} [params.httpsAlways=false]
 *
 * @param {Number} [params.max=20]
 *     This is the maximum number of requests Batch Request will accept in one batch.
 *     Any more than this max will result in a 400 error.
 *
 * @param {Boolean} [params.validateRespond=true]
 *     Whether or not to respond in the validation middleware.
 *     Setting to false leaves it up to you to respond.
 *
 * @param {Array} [params.allowedHosts=null]
 *     Array list of strings which represent allowed hosts.
 *     For example ['socialradar.com', 'localhost:3000']. Must include port if used.
 *     If any request is not in the list of allowedHosts, the Batch Request validator will return a 400 error.
 *
 * @param {Object} [params.defaultHeaders={}]
 * @param {Array} [params.forwardHeaders=[]]
 *
 * @param {Object} [params.formData={}]
 *     Options for use when posting multipart/form-data.
 *
 * @param {String} [params.formData.request="request"]
 *     When submitting a multipart request, this identifies the field name that contains the JSON request details.
 *
 * @param {String} [params.formData.files="files"]
 *     The property on the request object to look for multipart file attachments.
 *     @todo look at multer docs - should this optionally be an array?
 *
 * @param {String} [params.formData.fileRefs="@fileRefs"]
 *     The name of the property within the formData object that contains references to the `name`s of uploaded files.
 *
 * @param {String} [params.formData.fieldname="fieldname"]
 *     On the file object sent in from the middleware, the name of the property that contains the file's `name` value.
 *
 * @returns {batch}
 */
var batchRequest = function(params) {

    // Set default option values
    params = params || {};
    params.localOnly = (typeof params.localOnly === 'undefined') ? true : params.localOnly;
    params.httpsAlways = (typeof params.localOnly === 'undefined') ? false : params.localOnly;
    params.max = (typeof params.max === 'undefined') ? 20 : params.max;
    params.validateRespond = (typeof params.validateRespond === 'undefined') ? true : params.validateRespond;
    params.allowedHosts = (typeof params.allowedHosts === 'undefined') ? null : params.allowedHosts;
    params.defaultHeaders = (typeof params.defaultHeaders === 'undefined') ? {} : params.defaultHeaders;
    params.forwardHeaders = (typeof params.forwardHeaders === 'undefined') ? [] : params.forwardHeaders;
    params.formData = params.formData || {};
    params.formData.request = (typeof params.formData.request === 'undefined') ? 'request' : params.formData.request;
    params.formData.files = (typeof params.formData.files === 'undefined') ? 'files' : params.formData.files;
    params.formData.fileRefs = (typeof params.formData.fileRefs === 'undefined') ? '@fileRefs' : params.formData.fileRefs;
    params.formData.fieldname = (typeof params.formData.fieldname === 'undefined') ? 'fieldname' : params.formData.fieldname;

    wx.console.log('params')(params);
    var batch = function(req, res, next) {
        // Here we assume the request has already been validated, either by
        // our included middleware or otherwise by the app developer.

        // We also assume it has been run through some middleware like
        // express.bodyParser() or express.json() to parse the requests.

        // If the request is of type multipart/form-data, it will also have been
        // run through middleware like multer.

        var isFormData = (req.headers['content-type'].indexOf('multipart/form-data') > -1);

        var requests = req.body;
        var files = req[params.formData.files];
        var filesObject = {};
        if (isFormData && req.body[params.formData.request]) {
            requests = JSON.parse(req.body[params.formData.request]);
        }
        wx.console.log('files')(files);
        wx.console.log('requests start')(requests);

        if (files) {
            files.forEach(function(file) {
                filesObject[file[params.formData.fieldname]] = file;
            });
            wx.console.log('filesObject')( filesObject );

            _.each(requests, function(requestValue, requestKey) {

                var fileRefs = requestValue.formData[params.formData.fileRefs];
                wx.console.log('fileRefs')(fileRefs);
                _.each(fileRefs, function(fileRef, fileRefsIndex) {

                    _.each(fileRef, function(filesToSubstitute, fileKey) {
                        // filesToSubstitute will be a string that references the `name` of one of the originally uploaded files,
                        // or an array of strings that reference `name`s of the originally uploaded files.
                        if (Array.isArray(filesToSubstitute)) {

                            // This is working against https://requestb.in/vdh0t0vd
                            requests[requestKey].formData[fileKey] = [];

                            filesToSubstitute.forEach(function(fileToSubstitute) {
                                requests[requestKey].formData[fileKey].push(Buffer.from(filesObject[fileToSubstitute].buffer));
                            });

                        }
                        else {

                            // This is working against https://requestb.in/vdh0t0vd
                            requests[requestKey].formData[fileKey] = Buffer.from(filesObject[filesToSubstitute].buffer);
                        }
                    });

                });

                // Need to remove or flatten any formData properties deeper than one level
                // @fileRefs is no longer needed since the references have been converted to buffers above
                delete requestValue.formData[params.formData.fileRefs];

            });

            wx.console.log('requests end')(requests);
        }

        var requestPromise = function requestPromise(r) {
            r.resolveWithFullResponse = true;
            r.headers = r.headers || {};

            r.url = getFinalUrl(req, r);

            _.each(params.defaultHeaders, function(headerV, headerK) {
                if (!(headerK in r.headers)) { // copy defaults if not already exposed
                    r.headers[headerK] = headerV;
                }
            });
            _.each(params.forwardHeaders, function(headerK) {
                if (!(headerK in r.headers) && headerK in req.headers) { // copy forward if not already exposed
                    var forwardValue = req.headers[headerK];
                    r.headers[headerK] = forwardValue;
                }
            });
            wx.console.log('requestPromise')(r);
            return request(r)
                .then(function(response) {
                    debug('then');
                    var body = response.body;
                    if (response.headers && response.headers['content-type'] &&
                        response.headers['content-type'].indexOf( 'application/json' ) > -1) {
                        try {
                            body = JSON.parse(response.body);
                        } catch( e ) {
                            // no-op
                        }
                    }
                    return {
                        'statusCode': response.statusCode,
                        'body': body,
                        'headers': response.headers
                    };
                })
                .catch(function(err) {
                    wx.console.log('catch')(err);
                    var body = '', headers = '';
                    if (err.response && err.response.body) {
                        body = err.response.body;
                    }
                    if (err.response && err.response.headers) {
                        headers = err.response.headers;
                    }
                    return {
                        statusCode: err.statusCode,
                        body: body,
                        headers: headers
                    };
                });
        };

        // First, let's fire off all calls without any dependencies, accumulate their promises
        var requestPromises = _.reduce(requests, function(promises, r, key) {
            if (!r.dependency || r.dependency === 'none') {
                promises[key] = requestPromise(r);
            }
            // And while we do that, build the dependency object with those items as keys
            // { key: Promise }
            return promises;
        }, {});

        // The documentation for es6-template-strings suggests using the spread operator (...),
        // but I'm avoiding it for compatibility with older node versions
        var escapeSubstitutions = function(/* literals, ...substitutions */) {
            var literals = arguments[0];
            var substitutions = Array.prototype.slice.call(arguments, 1);

            var resolvedString = '';
            for (var i = 0; i < literals.length; i++) {
                resolvedString += literals[i];
                if (typeof substitutions[i] !== 'undefined' && substitutions[i] !== null) {
                    // Since we're substituting into a JSON string, we need to escape double quotes
                    resolvedString += substitutions[i].replace(/"/gi, '\\"');
                }
            }
            return resolvedString;
        };

        // Then recursively iterate over all items with dependencies, resolving some at each pass
        var recurseDependencies = function(reqs) {

            wx.console.log('recurseDependencies')(reqs);

            // End state hit when the number of promises we have matches the number
            // of request objects we started with.
            if (_.size(requestPromises) >= _.size(reqs)) {
                return;
            } else {
                _.each(requestPromises, function(rp, key) {
                    // rp = the request's promise
                    // key = the request's key/name

                    var dependencyPromises = [];
                    var dependentKey = null;
                    var dependent = _.find(reqs, function(request, dKey) {
                        // dKey = the request's key/name
                        dependentKey = dKey;

                        var isDependency = false;

                        if (typeof requestPromises[dKey] === 'undefined') {
                            if (Array.isArray(request.dependency)) {
                                if (request.dependency.indexOf(key) > -1) {
                                    isDependency = true;
                                }
                            }
                            else {
                                if (request.dependency === key) {
                                    isDependency = true;
                                }
                            }
                        }

                        return isDependency;
                    });

                    if (dependent) {
                        var dependencyIsArray = true;

                        if (!Array.isArray(dependent.dependency)) {
                            dependencyIsArray = false;
                            dependent.dependency = [dependent.dependency];
                        }
                        _.each(dependent.dependency, function(dependencyKey) {
                            dependencyPromises.push(requestPromises[dependencyKey]);
                        });

                        requestPromises[dependentKey] = Promise.all(dependencyPromises).then(function(dependencyResponses) {
                            // Looking good here.  dependencyResponses is an array of responses from the dependencyPromises

                            var dependencyTemplate = dependencyResponses;
                            if (!dependencyIsArray) {
                                dependencyTemplate = dependencyResponses[0];
                            }

                            var jsonRequest = JSON.stringify(dependent),
                                compiled = es6TemplateStringsCompile(jsonRequest),
                                resolved = es6TemplateStringsResolve(compiled, { dependency : dependencyTemplate }),
                                parsedJsonRequest = escapeSubstitutions.apply(null, resolved),
                                parsedDependent = JSON.parse(parsedJsonRequest)
                                ;

                            // Buffers will have been broken by JSON conversion - this fixes them
                            // @todo if the dependency requires a file from the response, it will have to reference it via es6 and be bufferized
                            // test/uploadFilesMultipartDependency.json
                            // es6templatestrings might fuck up a buffer - need to test and see what happens
                            // i think it's going to try to JSON.parse the buffer - no idea what will happen there
                            // might need to do some interrogation - maybe Resolve allows a callback to process each key/value pair
                            // Maybe look to see if the end-result conversion is consistent; ex. {type: "Buffer", data: "..."}
                            if (dependent.formData) {
                                _.each(dependent.formData, function(dependentFormDataValue, dependentFormDataKey) {
                                    if (Array.isArray(dependentFormDataValue)) {
                                        dependentFormDataValue.forEach(function(dependentFormDataArrayItem, dependentFormDataArrayIndex) {
                                            if (Buffer.isBuffer(dependentFormDataArrayItem)) {
                                                parsedDependent.formData[dependentFormDataKey][dependentFormDataArrayIndex] = dependentFormDataArrayItem;
                                            }
                                        });
                                    }
                                    else {
                                        if (Buffer.isBuffer(dependentFormDataValue)) {
                                            parsedDependent.formData[dependentFormDataKey] = dependent.formData[dependentFormDataKey];
                                        }
                                    }
                                });
                            }

                            return requestPromise(parsedDependent);
                        });
                    }
                });

                recurseDependencies(reqs);
            }
        };

        // Recurse dependencies
        recurseDependencies(requests);

        // Wait for all to complete before responding
        Promise.props(requestPromises).then(function(result) {

            // remove all properties, except status, body, and headers
            var output = {};
            for(var prop in result){
                output[prop] = { statusCode: result[prop].statusCode, body: result[prop].body, headers: result[prop].headers};
            }
            res.json(output);
            // next(); // this line is causing the response to be 0
        });
    };

    batch.validate = function(req, res, next) {
        var err = null,
            requests = req.body,
            requestHost;

        // Validation on Request object as a whole
        try {
            if (_.size(requests) < 1) {
                throw new Error('Cannot make a batch request with an empty request object');
            }
            if (_.size(requests) > params.max) {
                throw new Error('Over the max request limit. Please limit batches to ' + params.max + ' requests');
            }
            if (req.method === 'POST' && !req.is('json')) {
                throw new Error('Batch Request will only accept body as json');
            }
        } catch (e) {
            err = {
                error: {
                    'message': e.message,
                    'type': 'ValidationError'
                }
            };
        }

        function makeValidatonError(key, message) {
            return {
                error: {
                    'message': message,
                    'request': key,
                    'type': 'ValidationError'
                }
            };
        }

        // Validation on each request object
        _.each(requests, function(r, key) {

            // If no method provided, default to GET
            r.method = (typeof r.method === 'string') ? r.method.toLowerCase() : 'get';

            r.url = getFinalUrl(req, r);

            if (!validator.isURL(r.url)) {
                err = makeValidatonError(key, 'Invalid URL');
            }
            if (!validator.isIn(r.method, methods)) {
                err = makeValidatonError(key, 'Invalid method');
            }
            if (r.body !== undefined) {
                if (!validator.isIn(r.method.toLowerCase(), ['put', 'post', 'options'])) {
                    err = makeValidatonError(key, 'Request body not allowed for this method');
                }
            }

            if (params.allowedHosts !== null) {
                requestHost = url.parse(r.url).host;
                if (params.allowedHosts.indexOf(requestHost) === -1) {
                    err = {
                        error: {
                            'message': 'Cannot make batch request to a host which is not allowed',
                            'host': requestHost,
                            'type': 'ValidationError'
                        }
                    };
                }
            }
        });

        if (err !== null) {
            res.status(400).send(err);
            next(err);
        } else {
            next();
        }
    };

    return batch;
};

module.exports = batchRequest;
