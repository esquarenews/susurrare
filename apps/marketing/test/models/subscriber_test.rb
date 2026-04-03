require "test_helper"

class SubscriberTest < ActiveSupport::TestCase
  test "is valid with a name and email" do
    subscriber = Subscriber.new(name: "Morgan Lee", email: "morgan@example.com")

    assert subscriber.valid?
  end

  test "normalizes email before validation" do
    subscriber = Subscriber.create!(name: "Morgan Lee", email: "  MORGAN@Example.COM ")

    assert_equal "morgan@example.com", subscriber.email
  end

  test "requires a unique email address" do
    subscriber = Subscriber.new(name: "Another", email: subscribers(:existing).email.upcase)

    assert_not subscriber.valid?
    assert_includes subscriber.errors[:email], "has already been taken"
  end

  test "rejects an invalid email format" do
    subscriber = Subscriber.new(name: "Morgan Lee", email: "invalid")

    assert_not subscriber.valid?
    assert_includes subscriber.errors[:email], "is invalid"
  end
end
