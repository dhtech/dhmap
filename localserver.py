#!/usr/bin/env python2
# Used to run dhmap + analytics on the same machine for dev purposes

import SimpleHTTPServer
import SocketServer

PORT = 8000

class RevHandler(SimpleHTTPServer.SimpleHTTPRequestHandler):
  def do_GET(self):
    if self.path.startswith('/analytics/'):
      path = self.path[len('/analytics/'):]
      self.send_response(302)
      self.send_header("Location", "http://localhost:5000/" + path)
      self.end_headers()
      return None
    else:
      SimpleHTTPServer.SimpleHTTPRequestHandler.do_GET(self)

httpd = SocketServer.TCPServer(("", PORT), RevHandler)

print "serving at port", PORT
httpd.serve_forever()

