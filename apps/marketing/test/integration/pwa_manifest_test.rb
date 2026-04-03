require "test_helper"

class PwaManifestTest < ActionDispatch::IntegrationTest
  test "renders a manifest with a dedicated maskable icon" do
    get pwa_manifest_url(format: :json)

    assert_response :success

    manifest = JSON.parse(response.body)
    maskable_icon = manifest.fetch("icons").find { |icon| icon["purpose"] == "maskable" }

    assert_equal "/icon-maskable.png", maskable_icon.fetch("src")
    assert_equal "512x512", maskable_icon.fetch("sizes")
    assert_equal "#000000", manifest.fetch("theme_color")
  end
end
