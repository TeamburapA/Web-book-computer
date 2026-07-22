const regex = /^[a-zA-Z0-9_\u0E00-\u0E7F]{3,20}$/;
const testName = '539616Kul🌟😀🌟🌟💀💀😀💀🚀🌟';
console.log('Regex test result:', regex.test(testName));
console.log('Length of testName:', testName.length);
