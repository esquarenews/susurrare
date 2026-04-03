class CreateSubscribers < ActiveRecord::Migration[8.1]
  def change
    create_table :subscribers do |t|
      t.string :name, null: false
      t.string :email, null: false
      t.string :company

      t.timestamps
    end

    add_index :subscribers, :email, unique: true
  end
end
