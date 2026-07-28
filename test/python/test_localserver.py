"""Tests for localserver.py, the local development web server."""
import os
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
  """Stops urllib following redirects, so the 302 itself can be inspected."""

  def redirect_request(self, *args):
    return None


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

  def test_redirects_analytics_to_the_backend(self):
    opener = urllib.request.build_opener(NoRedirect)
    with self.assertRaises(urllib.error.HTTPError) as caught:
      opener.open(self.url('/analytics/ping.status'))
    self.assertEqual(caught.exception.code, 302)
    self.assertEqual(caught.exception.headers.get('Location'),
                     'http://localhost:5099/ping.status')
    caught.exception.close()

  def test_serves_from_the_repository_regardless_of_working_directory(self):
    # The handler pins its directory, so tests can run from anywhere.
    self.assertEqual(urllib.request.urlopen(self.url('/README.md')).status,
                     200)


if __name__ == '__main__':
  unittest.main()
