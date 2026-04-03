class Subscriber < ApplicationRecord
  before_validation :normalize_fields

  validates :name, presence: true, length: { maximum: 120 }
  validates :email,
    presence: true,
    format: { with: URI::MailTo::EMAIL_REGEXP },
    uniqueness: { case_sensitive: false },
    length: { maximum: 255 }
  validates :company, length: { maximum: 120 }, allow_blank: true

  private

  def normalize_fields
    self.name = name.to_s.strip
    self.email = email.to_s.strip.downcase
    self.company = company.to_s.strip.presence
  end
end
