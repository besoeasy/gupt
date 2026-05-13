#include <gio/gio.h>
#include <gtk/gtk.h>
#include <libsoup/soup.h>
#include <webkit/webkit.h>

typedef struct {
  SoupServer *server;
  gchar *content_dir;
  guint port;
} GuptShell;

static const char *guess_content_type(const char *path) {
  if (g_str_has_suffix(path, ".html")) return "text/html; charset=utf-8";
  if (g_str_has_suffix(path, ".js")) return "application/javascript; charset=utf-8";
  if (g_str_has_suffix(path, ".css")) return "text/css; charset=utf-8";
  if (g_str_has_suffix(path, ".json")) return "application/json; charset=utf-8";
  if (g_str_has_suffix(path, ".svg")) return "image/svg+xml";
  if (g_str_has_suffix(path, ".png")) return "image/png";
  if (g_str_has_suffix(path, ".webp")) return "image/webp";
  if (g_str_has_suffix(path, ".ico")) return "image/x-icon";
  if (g_str_has_suffix(path, ".woff2")) return "font/woff2";
  if (g_str_has_suffix(path, ".txt")) return "text/plain; charset=utf-8";
  return "application/octet-stream";
}

static void respond_with_status(SoupServerMessage *message, guint status_code, const char *reason) {
  const char *body_text = reason ? reason : "";
  GBytes *bytes = g_bytes_new(body_text, strlen(body_text));
  SoupMessageBody *body = soup_server_message_get_response_body(message);

  soup_message_headers_set_content_type(
    soup_server_message_get_response_headers(message),
    "text/plain; charset=utf-8",
    NULL
  );
  soup_server_message_set_status(message, status_code, NULL);
  soup_message_body_append_bytes(body, bytes);
  soup_message_body_complete(body);
  g_bytes_unref(bytes);
}

static char *resolve_request_path(GuptShell *shell, const char *request_path) {
  const char *relative_path = request_path;

  if (!relative_path || relative_path[0] == '\0' || g_str_equal(relative_path, "/")) {
    relative_path = "index.html";
  } else if (relative_path[0] == '/') {
    relative_path += 1;
  }

  if (relative_path[0] == '\0') relative_path = "index.html";
  if (strstr(relative_path, "..")) return NULL;

  return g_build_filename(shell->content_dir, relative_path, NULL);
}

static void handle_request(
  SoupServer *server,
  SoupServerMessage *message,
  const char *path,
  GHashTable *query,
  gpointer user_data
) {
  GuptShell *shell = user_data;
  const char *method = soup_server_message_get_method(message);

  (void)server;
  (void)query;

  if (!g_str_equal(method, "GET") && !g_str_equal(method, "HEAD")) {
    respond_with_status(message, SOUP_STATUS_NOT_IMPLEMENTED, "Unsupported method");
    return;
  }

  g_autofree char *resolved_path = resolve_request_path(shell, path);
  if (!resolved_path) {
    respond_with_status(message, SOUP_STATUS_FORBIDDEN, "Invalid path");
    return;
  }

  if (!g_file_test(resolved_path, G_FILE_TEST_EXISTS) && !strchr(path, '.')) {
    g_free(resolved_path);
    resolved_path = g_build_filename(shell->content_dir, "index.html", NULL);
  }

  if (!g_file_test(resolved_path, G_FILE_TEST_EXISTS) || g_file_test(resolved_path, G_FILE_TEST_IS_DIR)) {
    respond_with_status(message, SOUP_STATUS_NOT_FOUND, "Not found");
    return;
  }

  g_autofree char *contents = NULL;
  gsize length = 0;
  if (!g_file_get_contents(resolved_path, &contents, &length, NULL)) {
    respond_with_status(message, SOUP_STATUS_INTERNAL_SERVER_ERROR, "Unable to read asset");
    return;
  }

  soup_message_headers_set_content_type(
    soup_server_message_get_response_headers(message),
    guess_content_type(resolved_path),
    NULL
  );
  soup_server_message_set_status(message, SOUP_STATUS_OK, NULL);

  if (g_str_equal(method, "HEAD")) return;

  GBytes *bytes = g_bytes_new_take(g_steal_pointer(&contents), length);
  SoupMessageBody *body = soup_server_message_get_response_body(message);
  soup_message_body_append_bytes(body, bytes);
  soup_message_body_complete(body);
  g_bytes_unref(bytes);
}

static gboolean permission_request_cb(
  WebKitWebView *web_view,
  WebKitPermissionRequest *request,
  gpointer user_data
) {
  (void)web_view;
  (void)user_data;

  if (WEBKIT_IS_USER_MEDIA_PERMISSION_REQUEST(request) ||
      WEBKIT_IS_NOTIFICATION_PERMISSION_REQUEST(request)) {
    webkit_permission_request_allow(request);
    return TRUE;
  }

  return FALSE;
}

static gboolean start_local_server(GuptShell *shell, GError **error) {
  shell->server = soup_server_new("server-header", "gupt", NULL);
  soup_server_add_handler(shell->server, "/", handle_request, shell, NULL);

  if (!soup_server_listen_local(shell->server, 0, SOUP_SERVER_LISTEN_IPV4_ONLY, error)) {
    return FALSE;
  }

  GSList *uris = soup_server_get_uris(shell->server);
  if (!uris) {
    g_set_error(error, G_IO_ERROR, G_IO_ERROR_FAILED, "Local asset server did not expose a URI");
    return FALSE;
  }

  shell->port = (guint)g_uri_get_port(uris->data);
  g_slist_free_full(uris, (GDestroyNotify)g_uri_unref);
  return TRUE;
}

static void activate(GtkApplication *application, gpointer user_data) {
  GuptShell *shell = user_data;
  g_autoptr(GError) error = NULL;

  if (!shell->server && !start_local_server(shell, &error)) {
    g_printerr("Failed to start local asset server: %s\n", error->message);
    return;
  }

  GtkWidget *window = gtk_application_window_new(application);
  gtk_window_set_title(GTK_WINDOW(window), "GUPT");
  gtk_window_set_default_size(GTK_WINDOW(window), 1360, 900);

  GtkWidget *web_view = webkit_web_view_new();
  WebKitSettings *settings = webkit_settings_new();

  webkit_settings_set_enable_media(settings, TRUE);
  webkit_settings_set_enable_media_stream(settings, TRUE);
  webkit_settings_set_enable_webaudio(settings, TRUE);
  webkit_settings_set_enable_webgl(settings, TRUE);
  webkit_settings_set_enable_webrtc(settings, TRUE);
  webkit_settings_set_enable_html5_database(settings, TRUE);
  webkit_settings_set_enable_html5_local_storage(settings, TRUE);
  webkit_settings_set_enable_back_forward_navigation_gestures(settings, TRUE);
  webkit_settings_set_javascript_can_access_clipboard(settings, TRUE);
  webkit_web_view_set_settings(WEBKIT_WEB_VIEW(web_view), settings);
  g_object_unref(settings);

  g_signal_connect(web_view, "permission-request", G_CALLBACK(permission_request_cb), NULL);

  gtk_window_set_child(GTK_WINDOW(window), web_view);
  gtk_window_present(GTK_WINDOW(window));

  g_autofree char *url = g_strdup_printf("http://127.0.0.1:%u/index.html", shell->port);
  webkit_web_view_load_uri(WEBKIT_WEB_VIEW(web_view), url);
}

int main(int argc, char **argv) {
  GuptShell shell = {
    .server = NULL,
    .content_dir = g_strdup("/app/share/gupt"),
    .port = 0,
  };
  GtkApplication *application = gtk_application_new("com.besoeasy.gupt", G_APPLICATION_DEFAULT_FLAGS);
  int status;

  g_signal_connect(application, "activate", G_CALLBACK(activate), &shell);
  status = g_application_run(G_APPLICATION(application), argc, argv);

  if (shell.server) g_object_unref(shell.server);
  g_free(shell.content_dir);
  g_object_unref(application);
  return status;
}