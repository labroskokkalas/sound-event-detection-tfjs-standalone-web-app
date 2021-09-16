Sound events detection standalone web app using TensorFlowJS and node.js at the backend

1. convert tf model to tfjs

    tensorflowjs_converter --input_format=keras ./model.h5 ./model

2. generate certificate for secure local server

    openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365
	
3. run node server that serves the standalone sound event detection web app	

    node server.js
	
	
<img src="./diagram.svg">