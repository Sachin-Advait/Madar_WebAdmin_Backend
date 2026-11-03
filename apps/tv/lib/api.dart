import 'dart:convert';
import 'dart:typed_data';

import 'package:http/http.dart' as http;

class ApiException implements Exception {
  final int status;
  final String message;
  ApiException(this.status, this.message);
  @override
  String toString() => message;
}

class MadarApi {
  final Uri origin;
  final http.Client client;
  String? deviceKey;
  MadarApi(String base, {http.Client? client, this.deviceKey})
    : origin = Uri.parse(base),
      client = client ?? http.Client() {
    if (!['https', 'http'].contains(origin.scheme) ||
        origin.host.isEmpty ||
        origin.userInfo.isNotEmpty ||
        origin.query.isNotEmpty ||
        origin.fragment.isNotEmpty ||
        !['', '/'].contains(origin.path)) {
      throw const FormatException(
        'Enter the server origin, for example https://tv.example.com',
      );
    }
    if (origin.scheme != 'https' &&
        !const bool.fromEnvironment('MADAR_ALLOW_HTTP')) {
      throw const FormatException(
        'HTTPS is required. Local development builds may enable MADAR_ALLOW_HTTP.',
      );
    }
  }
  Future<http.Response> raw(
    String path, {
    String method = 'GET',
    Object? body,
    Map<String, String> headers = const {},
  }) async {
    if (!path.startsWith('/api/') || path.startsWith('//')) {
      throw const FormatException('Invalid API path');
    }
    final req = http.Request(method, origin.resolve(path))
      ..followRedirects = false;
    req.headers.addAll({
      'Accept': 'application/json',
      'X-Screen-Key': ?deviceKey,
      ...headers,
    });
    if (body != null) {
      req.headers['Content-Type'] = 'application/json';
      req.body = jsonEncode(body);
    }
    final response = await http.Response.fromStream(
      await client.send(req).timeout(const Duration(seconds: 15)),
    ).timeout(const Duration(seconds: 20));
    if (response.statusCode >= 400 ||
        response.statusCode >= 300 && response.statusCode != 304) {
      String message = 'Server request failed (${response.statusCode})';
      try {
        message = '${jsonDecode(response.body)['detail'] ?? message}';
      } catch (_) {}
      throw ApiException(response.statusCode, message);
    }
    return response;
  }

  Future<dynamic> json(
    String path, {
    String method = 'GET',
    Object? body,
    Map<String, String> headers = const {},
  }) async {
    final r = await raw(path, method: method, body: body, headers: headers);
    if (r.statusCode == 204 || r.statusCode == 304 || r.body.isEmpty) {
      return null;
    }
    return jsonDecode(utf8.decode(r.bodyBytes));
  }

  Future<void> download(
    String path,
    int expectedBytes,
    Future<void> Function(Uint8List) consume,
  ) async {
    final req = http.Request('GET', origin.resolve(path))
      ..followRedirects = false;
    req.headers['X-Screen-Key'] = deviceKey!;
    final response = await client
        .send(req)
        .timeout(const Duration(seconds: 20));
    if (response.statusCode != 200) {
      throw ApiException(response.statusCode, 'Asset download failed');
    }
    if (response.contentLength != null &&
        response.contentLength! > expectedBytes) {
      throw const FormatException('Asset size exceeds manifest');
    }
    var bytes = 0;
    await for (final chunk in response.stream.timeout(
      const Duration(seconds: 20),
    )) {
      bytes += chunk.length;
      if (bytes > expectedBytes) {
        throw const FormatException('Asset exceeds declared size');
      }
      await consume(Uint8List.fromList(chunk));
    }
    if (bytes != expectedBytes) {
      throw const FormatException('Asset size mismatch');
    }
  }

  void close() => client.close();
}
