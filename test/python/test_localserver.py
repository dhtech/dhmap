"""Tests for localserver.py, the local development web server."""
import contextlib
import http.server
import json
import os
import socketserver
import sys
import threading
import unittest
import urllib.error
import urllib.request

REPO_ROOT = os.path.dirname(os.path.dirname(
    os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, REPO_ROOT)
import localserver                                         # noqa: E402


class NoRedirect(urllib.request.HTTPRedirectHandler):
  """Stops urllib following redirects, so a redirect would be visible."""

  def redirect_request(self, *args):
    return None


@contextlib.contextmanager
def backend_on(port, routes):
  """Run a stub analytics backend, yielding the paths it was asked for."""
  requested = []

  class Handler(http.server.BaseHTTPRequestHandler):

    def log_message(self, *args):
      pass

    def do_GET(self):
      requested.append(self.path)
      body = routes.get(self.path.lstrip('/'))
      if body is None:
        return self.send_error(404, 'no such endpoint')
      encoded = json.dumps(body).encode('utf-8')
      self.send_response(200)
      self.send_header('Content-Type', 'application/json')
      self.send_header('Content-Length', str(len(encoded)))
      self.end_headers()
      self.wfile.write(encoded)

  socketserver.TCPServer.allow_reuse_address = True
  httpd = socketserver.TCPServer(('127.0.0.1', port), Handler)
  threading.Thread(target=httpd.serve_forever, daemon=True).start()
  try:
    yield requested
  finally:
    httpd.shutdown()
    httpd.server_close()


class LocalServerTest(unittest.TestCase):

  @classmethod
  def setUpClass(cls):
    cls.httpd = localserver.serve(port=0, analytics_port=5099, quiet=True)
    cls.port = cls.httpd.server_address[1]
    cls.thread = threading.Thread(target=cls.httpd.serve_forever, daemon=True)
    cls.thread.start()

  @classmethod
  def tearDownClass(cls):
    cls.httpd.shutdown()
    cls.httpd.server_close()

  def url(self, path):
    return 'http://127.0.0.1:%d%s' % (self.port, path)

  def test_serves_the_application_page(self):
    self.assertEqual(urllib.request.urlopen(self.url('/dhmon.html')).status,
                     200)

  def test_serves_vendored_assets(self):
    for path in ['/src/vendor/jquery-3.7.1/jquery-3.7.1.min.js',
                 '/src/vendor/raphael-2.3.0/raphael.min.js',
                 '/src/vendor/raphael-zpd/raphael-zpd.js',
                 '/src/vendor/jquery-ui-1.13.3/jquery-ui.min.js']:
      self.assertEqual(urllib.request.urlopen(self.url(path)).status, 200,
                       'missing asset: %s' % path)

  def test_serves_the_example_page(self):
    self.assertEqual(
        urllib.request.urlopen(self.url('/src/examples/index.html')).status,
        200)

  def test_proxies_analytics_without_redirecting(self):
    # Production apache does ProxyPass /analytics http://localhost:5000, so
    # the browser must see one origin. A redirect here would make these
    # requests cross-origin and behave differently to production.
    opener = urllib.request.build_opener(NoRedirect)
    with backend_on(5099, {'ping.status': {'sw': 7}}):
      response = opener.open(self.url('/analytics/ping.status'))
      self.assertEqual(response.status, 200)
      self.assertEqual(json.loads(response.read()), {'sw': 7})

  def test_proxy_strips_the_analytics_prefix(self):
    with backend_on(5099, {'deep/path.status': {'ok': True}}) as requested:
      urllib.request.urlopen(self.url('/analytics/deep/path.status')).read()
      self.assertEqual(requested, ['/deep/path.status'])

  def test_proxy_passes_backend_errors_through(self):
    with backend_on(5099, {}):
      with self.assertRaises(urllib.error.HTTPError) as caught:
        urllib.request.urlopen(self.url('/analytics/nope.status'))
      self.assertEqual(caught.exception.code, 404)
      caught.exception.close()

  def test_reports_a_bad_gateway_when_the_backend_is_down(self):
    # Nothing is listening on 5099 here; a clear 502 beats a hung request.
    with self.assertRaises(urllib.error.HTTPError) as caught:
      urllib.request.urlopen(self.url('/analytics/ping.status'))
    self.assertEqual(caught.exception.code, 502)
    caught.exception.close()

  def test_serves_from_the_repository_regardless_of_working_directory(self):
    # The handler pins its directory, so tests can run from anywhere.
    self.assertEqual(urllib.request.urlopen(self.url('/README.md')).status,
                     200)


if __name__ == '__main__':
  unittest.main()
