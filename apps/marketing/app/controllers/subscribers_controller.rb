class SubscribersController < ApplicationController
  def create
    @subscriber = Subscriber.new(subscriber_params)

    if @subscriber.save
      redirect_to root_path(anchor: "waitlist"), notice: "You are on the list."
    else
      flash.now[:alert] = "Please check the highlighted fields."
      render "home/index", status: :unprocessable_entity
    end
  end

  private

  def subscriber_params
    params.expect(subscriber: [ :name, :email, :company ])
  end
end
