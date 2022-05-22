const http = require("http");
const Parameter = require("./controllers");
const { getRequestData } = require("./utils");
const PORT = 5000;

let transferFunctionsController;

const server = http.createServer(async (req, res) => {
    // request route
    // remove / at the end so it is always without
    const requestUrl = req.url.replace(/[\/]$/,"");

    // localhost:5000/api/getTransferFunctions POST

    if (requestUrl === "/api/get-transfer-functions" && req.method === "OPTIONS") {
        res.writeHead(200, {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Origin, X-Requested-With, Content-Type, Accept"
        });

        //end the response
        res.end();
    } else if (requestUrl === "/api/get-transfer-functions" && req.method === "POST") {
        // read from post
        // https://stackoverflow.com/questions/4295782/how-to-process-post-data-in-node-js
        const chunks = [];
        req.on('data', chunk => chunks.push(chunk));
        req.on('end', () => {
            let data = Buffer.concat(chunks);
            data = JSON.parse(data);

            let transferFunctions = {};

            if (data.volume) {
                // loaded new volume, calculate new transfer functions
                transferFunctionsController = new Parameter(data.volume);
                transferFunctions = transferFunctionsController.getParameters();
            } else if (transferFunctionsController && typeof data.tfIndex !== 'undefined') {
                // get transfer functions based on selected parameter
                transferFunctions = transferFunctionsController.getParameters(data.tfIndex); // send in selected function's identification
            }

            // response headers
            res.writeHead(200, {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Origin, X-Requested-With, Content-Type, Accept"
            });

            // return transfer functions
            // end the response

            res.end(JSON.stringify(transferFunctions));
        })
    }

    // route not found
    else {
        res.writeHead(404, {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Origin, X-Requested-With, Content-Type, Accept"});
        res.end(JSON.stringify({ message: "Route not found" }));
    }
});

server.listen(PORT, () => {
    console.log(`Server started on port: ${PORT}`);
});