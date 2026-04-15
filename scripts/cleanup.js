/**
 * One-time cleanup script:
 * 1. Delete all Users except the one matching 82592F36...8C57F1
 * 2. Delete all Transactions (Purchase History)
 * 3. Delete all Coupons and CouponUsage (feature removed)
 *
 * Usage: node scripts/cleanup.js
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../server/models/User');
const Transaction = require('../server/models/Transaction');

async function main() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  // 1. Find the user to keep
  const allUsers = await User.find().lean();
  console.log(`Total users: ${allUsers.length}`);

  const keepUser = allUsers.find(u =>
    String(u._id).startsWith('82592F36') && String(u._id).endsWith('8C57F1')
  );

  if (!keepUser) {
    console.error('ERROR: Could not find user matching 82592F36...8C57F1');
    console.log('All user IDs:', allUsers.map(u => u._id));
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log(`Keeping user: ${keepUser._id} (coins: ${keepUser.coins})`);

  // 2. Delete other users
  const deleteResult = await User.deleteMany({ _id: { $ne: keepUser._id } });
  console.log(`Deleted ${deleteResult.deletedCount} users`);

  // 3. Delete all transactions
  const txnResult = await Transaction.deleteMany({});
  console.log(`Deleted ${txnResult.deletedCount} transactions`);

  // 4. Delete coupons & coupon usage (if collections exist)
  try {
    const couponResult = await mongoose.connection.collection('coupons').deleteMany({});
    console.log(`Deleted ${couponResult.deletedCount} coupons`);
  } catch (e) {
    console.log('No coupons collection found (skip)');
  }

  try {
    const usageResult = await mongoose.connection.collection('couponusages').deleteMany({});
    console.log(`Deleted ${usageResult.deletedCount} coupon usages`);
  } catch (e) {
    console.log('No couponusages collection found (skip)');
  }

  console.log('\nCleanup complete!');
  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
