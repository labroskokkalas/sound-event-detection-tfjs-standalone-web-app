Sound events detection standalone web app using TensorFlowJS and node.js at the backend

1. generate certificate for secure local server

    openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365
	
2. run node server that serves the standalone sound event detection app	

    node server.js
	
	
![Alt text](./diagram.svg)
<img src="./diagram.svg">