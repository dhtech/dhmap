#!/usr/bin/env python3
"""Serve dhmap locally, proxying /analytics/ to the analytics backend.

Used to run dhmap + analytics on the same machine for dev purposes. The
analytics backend is normally dhmon's; for local work without one, see
test/fake/backend.py, which serves the same endpoints from a scenario.

The proxy mirrors production, where apache is configured with
`ProxyPass /analytics http://localhost:5000` (see the dhmon::analytics puppet
class), so /analytics/ping.status is served from the backend's /ping.status
and the browser sees a single origin.
"""
import argparse
import functools
import http.server
import os
import socketserver
import urllib.error
import urllib.request

DEFAULT_PORT = 8000
DEFAULT_ANALYTICS_PORT = 5000
# Matches the ProxyPass url in the dhmon::analytics puppet class.
ANALYTICS_PREFIX = '/analytics'


class RevHandler(http.server.SimpleHTTPRequestHandler):
  """Static file handler that reverse-proxies /analytics/ to the backend."""

  analytics_port = DEFAULT_ANALYTICS_PORT
  # Long enough to survive a slow backend, short enough not to hang a reload.
  proxy_timeout = 10

  def do_GET(self):
    if self.path.startswith(ANALYTICS_PREFIX):
      # ProxyPass strips the prefix, so /analytics/ping.status is the
      # backend's /ping.status.
      return self._proxy(self.path[len(ANALYTICS_PREFIX):])
    return http.server.SimpleHTTPRequestHandler.do_GET(self)

  def _proxy(self, path):
    url = 'http://localhost:%d%s' % (self.analytics_port, path)
    try:
      with urllib.request.urlopen(url, timeout=self.proxy_timeout) as upstream:
        self._relay(upstream.status, upstream.headers, upstream.read())
    except urllib.error.HTTPError as error:
      # Pass the backend's own error through rather than masking it.
      with error:
        self._relay(error.code, error.headers, error.read())
    except (urllib.error.URLError, OSError) as error:
      self.send_error(502, 'analytics backend unreachable at %s: %s'
                           % (url, error))

  def _relay(self, status, headers, body):
    self.send_response(status)
    content_type = headers.get('Content-Type')
    if content_type:
      self.send_header('Content-Type', content_type)
    self.send_header('Content-Length', str(len(body)))
    self.end_headers()
    self.wfile.write(body)


def serve(port=DEFAULT_PORT, analytics_port=DEFAULT_ANALYTICS_PORT,
          directory=None, quiet=False):
  """Create a server. Returns it without serving, so tests can drive it.

  Pass port=0 to bind an arbitrary free port; read it back from
  httpd.server_address[1]. Pass quiet=True to suppress request logging.
  """
  # Subclass per server so concurrent servers can target different backends;
  # setting the attribute on a functools.partial would not reach the class.
  overrides = {'analytics_port': analytics_port}
  if quiet:
    overrides['log_message'] = lambda self, *args: None
  handler = type('BoundRevHandler', (RevHandler,), overrides)
  handler = functools.partial(
      handler,
      directory=directory or os.path.dirname(os.path.abspath(__file__)))
  # Without this a restart within TIME_WAIT fails to bind.
  socketserver.TCPServer.allow_reuse_address = True
  return socketserver.TCPServer(('', port), handler)


if __name__ == '__main__':
  parser = argparse.ArgumentParser(description=__doc__)
  parser.add_argument('--port', type=int, default=DEFAULT_PORT,
                      help='port to serve on (default: %(default)s)')
  parser.add_argument('--analytics-port', type=int,
                      default=DEFAULT_ANALYTICS_PORT,
                      help='analytics backend port (default: %(default)s)')
  args = parser.parse_args()

  httpd = serve(args.port, args.analytics_port)
  print('serving at port {}'.format(args.port))
  try:
    httpd.serve_forever()
  except KeyboardInterrupt:
    httpd.shutdown()
