require "test_helper"

class HomeControllerTest < ActionDispatch::IntegrationTest
  test "renders the homepage" do
    get root_url

    assert_response :success
    assert_includes response.body, "vocsen"
    assert_includes response.body, "Don't type. Speak in full clarity."
    assert_includes response.body, "Request access"
    assert_includes response.body, "favicon-16x16.png"
    assert_includes response.body, "manifest.json"
  end
end
