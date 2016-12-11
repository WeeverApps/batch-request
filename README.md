Batch Request
=============

A simple library for batching HTTP requests

Looking for [the Koa version of this module](https://github.com/socialradar/koa-batch)?

[View Documentation](http://batch-request.socialradar.com)

[![Build Status](https://travis-ci.org/socialradar/batch-request.png?branch=master)](https://travis-ci.org/socialradar/batch-request) [![Built with Grunt](https://cdn.gruntjs.com/builtwith.png)](http://gruntjs.com/)

## QuickStart

Download via [NPM](http://npmjs.org)

[![NPM](https://nodei.co/npm/batch-request.png?compact=true)](https://nodei.co/npm/batch-request/)

then in your app

    // Use Batch Request as middleware on an endpoint you want to service batch requests
    app.post('/batch', batch);


Optionally use our included middleware to check the validity of your batch request

    // Include the batch.validate middleware before batch middleware
    app.post('/batch', batch.validate, batch);

And that's it!

Proudly written in Washington, D.C. by:

[![SocialRadar](https://raw.github.com/socialradar/batch-request/master/social-radar-black-orange.png)](http://socialradar.com)

---

# Additional Info

## Multiple dependencies

When using multiple dependencies, they must be an array on the `dependency` property.

You can reference return values by referencing the element in the `dependency` array,
using es6 template string notation.

```json
{
    "uploadFile1" : {
        "method"  : "POST",
        "uri"     : "http://api.example.com/v1/files",
        "form"    : {
            "base64"      : "data:text/plain;base64,YWJjCg==",
            "filename"    : "base64_upload_test1.txt"
        }
    },
    "uploadFile2" : {
        "method"  : "POST",
        "uri"     : "http://localhost:8400/v1/files",
        "form"    : {
            "base64"      : "data:text/plain;base64,ZGVmCg==",
            "filename"    : "base64_upload_test2.txt"
        }
    },
    "emailLink"   : {
        "dependency" : [
            "uploadFile1",
            "uploadFile2"
        ],
        "method"     : "POST",
        "uri"        : "http://api.example.com/v1/email",
        "form"       : {
            "from"    : "someone@somewhere.com",
            "to"      : "user@example.com",
            "subject" : "batch test",
            "test"    : "${dependency[0].headers.etag} ${dependency[1].headers.etag}",
            "html"    : "Your files are at <a href=\"${dependency[0].body.file.url}\">${dependency[0].body.file.name}</a> and <a href=\"${dependency[1].body.file.url}\">${dependency[1].body.file.name}</a>."
        }
    }
}
```

## Multi-part File Uploads

There are a lot of configurable parameters that can be passed in to the library when it's instantiated.  Need to document.

Requires a `formData` property with a `@fileRefs` child property.
Files can be defined as a string or an array of strings. 
If referencing files being uploaded, the strings must match the keys (form names) of the uploaded files.
If referencing dependencies, returned buffers will be forwarded on as buffers.

generateAndSendPdf.json:
```json
{
    "generatePDF"  : {
        "method"             : "POST",
        "uri"                : "http://api.example.com/v1/pdf",
        "formData"           : {
            "@fileRefs"    : [
                {
                    "files" : [
                        "image1",
                        "image2"
                    ]
                }
            ],
            "pdf-data": "build pdf with data from these fields and the attached images"
        }
    },
    "emailPDF" : {
        "dependency"         : ["generatePDF"],
        "method"             : "POST",
        "uri"                : "http://api.example.com/v1/email",
        "formData"           : {
            "@fileRefs" : [
                {
                    "attachment" : "${dependency[0].body}" // or whatever property it comes back under; this is a stream
                }
            ],
            "from"    : "no-reply@privateappmail.com",
            "to"      : "garth@weeverapps.com",
            "subject" : "uploadFilesMultipartDependencyResponse test",
            "html"    : "Your file is attached."
        }
    }
}
```

```bash
curl -H "Content-Type: multipart/form-data" -F "json=<generateAndSendPdf.json" -F "image1=@starfish_career.jpg" -F "image2=@mr_t_blue.jpg" https://api.example.com/v1/batch
```

