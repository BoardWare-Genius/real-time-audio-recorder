import os
from http.server import HTTPServer, BaseHTTPRequestHandler, SimpleHTTPRequestHandler


class CustomHTTPRequestHandler(SimpleHTTPRequestHandler):

    def do_POST(self):
        filename = os.path.basename(self.path)
        file_length = int(self.headers['Content-Length'])
        with open(filename, 'wb') as output_file:
            output_file.write(self.rfile.read(file_length))
        self.send_response(201, 'Created')
        self.end_headers()
        reply_body = 'Saved "{}"\n'.format(filename)
        self.wfile.write(reply_body.encode('utf-8'))


httpd = HTTPServer(('0.0.0.0', 8000), CustomHTTPRequestHandler)
httpd.serve_forever()