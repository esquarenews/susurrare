require "test_helper"

class SubscribersControllerTest < ActionDispatch::IntegrationTest
  test "creates a subscriber from the waitlist form" do
    assert_difference("Subscriber.count", 1) do
      post subscribers_url, params: {
        subscriber: {
          name: "Avery Quinn",
          email: "avery@example.com",
          company: "Northstar"
        }
      }
    end

    assert_redirected_to root_url(anchor: "waitlist")
    follow_redirect!
    assert_includes response.body, "You are on the list."
  end

  test "re-renders the homepage when the subscriber is invalid" do
    assert_no_difference("Subscriber.count") do
      post subscribers_url, params: {
        subscriber: {
          name: "",
          email: "not-an-email",
          company: "Northstar"
        }
      }
    end

    assert_response :unprocessable_entity
    assert_includes response.body, "Please check the highlighted fields."
  end
end
